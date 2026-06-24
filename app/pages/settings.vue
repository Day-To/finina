<script setup>
// S10 — Settings. Default currency (applies to NEW records only — never converts
// existing stamped docs), theme, optional locale, and account / sign-out.
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { SunIcon, MoonIcon, MonitorIcon } from '@lucide/vue'

const auth = useAuthStore()
const { settings, currency, locale, hasSettings, setCurrency, setLocale } = useSettings()
const { preference } = useTheme()

const currencyDraft = ref(currency.value)
const localeDraft = ref(locale.value ?? '')
const saving = ref(false)

// Keep drafts in sync once settings load.
watch(currency, (c) => { currencyDraft.value = c })
watch(locale, (l) => { localeDraft.value = l ?? '' })

async function saveCurrency(code) {
  if (!code || code === currency.value) return
  saving.value = true
  try {
    await setCurrency(code)
    toast.success(`Default currency set to ${code}`)
  }
  catch {
    toast.error('Could not update currency')
    currencyDraft.value = currency.value
  }
  finally {
    saving.value = false
  }
}

async function saveLocale() {
  const value = localeDraft.value.trim()
  if ((value || '') === (locale.value || '')) return
  try {
    await setLocale(value)
    toast.success('Number formatting updated')
  }
  catch {
    toast.error('Could not update locale')
  }
}

const themeOptions = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'auto', label: 'System', icon: MonitorIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
]

async function onSignOut() {
  await auth.logout()
  await navigateTo('/login')
}

// ── One-time historical import (remove this block + useHistoryImport.js + data/history2026.json when done) ──
const importer = useHistoryImport()
async function loadHistory() {
  if (importer.running.value) return
  if (!window.confirm(`Import ${importer.monthCount} months (Feb–Jun 2026) from the spreadsheet? Safe to re-run; it updates those months and their accounts/funds.`)) return
  try {
    const r = await importer.run()
    toast.success(`Loaded ${r.months} months from the spreadsheet`)
  }
  catch (e) {
    toast.error(`Import failed: ${e?.message || 'unknown error'}`)
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
      <p class="text-sm text-muted-foreground">Manage your default currency, theme, and account.</p>
    </div>

    <!-- Default currency -->
    <UiCard>
      <UiCardHeader>
        <UiCardTitle>Default currency</UiCardTitle>
        <UiCardDescription>
          Applies to new plans, months, and expenses. It does not convert or reinterpret records you already created.
        </UiCardDescription>
      </UiCardHeader>
      <UiCardContent class="space-y-3">
        <div class="max-w-sm space-y-1.5">
          <UiLabel for="currency">Currency</UiLabel>
          <CurrencySelect id="currency" v-model="currencyDraft" :disabled="saving || !hasSettings" @update:model-value="saveCurrency" />
        </div>
        <p class="text-sm text-muted-foreground">
          Preview: <MoneyValue :amount="123456789" :currency="currencyDraft" class="font-medium text-foreground" />
        </p>
      </UiCardContent>
    </UiCard>

    <!-- Theme -->
    <UiCard>
      <UiCardHeader>
        <UiCardTitle>Theme</UiCardTitle>
        <UiCardDescription>Choose light, dark, or follow your system.</UiCardDescription>
      </UiCardHeader>
      <UiCardContent>
        <UiToggleGroup v-model="preference" type="single" variant="outline">
          <UiToggleGroupItem v-for="opt in themeOptions" :key="opt.value" :value="opt.value" class="gap-2 px-4">
            <component :is="opt.icon" class="size-4" /> {{ opt.label }}
          </UiToggleGroupItem>
        </UiToggleGroup>
      </UiCardContent>
    </UiCard>

    <!-- Locale -->
    <UiCard>
      <UiCardHeader>
        <UiCardTitle>Number formatting</UiCardTitle>
        <UiCardDescription>Optional locale for grouping (e.g. en-IN, en-US, de-DE). Leave blank to use your browser default.</UiCardDescription>
      </UiCardHeader>
      <UiCardContent>
        <div class="flex max-w-sm items-end gap-2">
          <div class="flex-1 space-y-1.5">
            <UiLabel for="locale">Locale</UiLabel>
            <UiInput id="locale" v-model="localeDraft" placeholder="en-IN" @keydown.enter="saveLocale" />
          </div>
          <UiButton variant="outline" @click="saveLocale">Save</UiButton>
        </div>
      </UiCardContent>
    </UiCard>

    <!-- One-time data import (temporary) -->
    <UiCard class="border-dashed">
      <UiCardHeader>
        <UiCardTitle>Load 2026 data</UiCardTitle>
        <UiCardDescription>One-time import of February–June 2026 from your spreadsheet (income, expenses, surplus, investments, checklist, daily logs). Idempotent — safe to re-run.</UiCardDescription>
      </UiCardHeader>
      <UiCardContent class="flex items-center gap-3">
        <UiButton variant="outline" :disabled="importer.running.value" @click="loadHistory">
          {{ importer.running.value ? 'Importing…' : 'Load 2026 data' }}
        </UiButton>
        <span v-if="importer.status.value" class="text-sm text-muted-foreground">{{ importer.status.value }}</span>
      </UiCardContent>
    </UiCard>

    <!-- Account -->
    <UiCard>
      <UiCardHeader>
        <UiCardTitle>Account</UiCardTitle>
        <UiCardDescription>{{ auth.user?.email || 'Signed in' }}</UiCardDescription>
      </UiCardHeader>
      <UiCardFooter>
        <UiButton variant="outline" @click="onSignOut">Sign out</UiButton>
      </UiCardFooter>
    </UiCard>
  </div>
</template>
