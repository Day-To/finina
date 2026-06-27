<script setup>
// S10 — Settings. Default currency (applies to NEW records only — never converts
// existing stamped docs), theme, optional locale, and account / sign-out.
import { ref, computed, watch } from 'vue'
import { toast } from 'vue-sonner'
import { SunIcon, MoonIcon, MonitorIcon, DownloadIcon, UploadIcon } from '@lucide/vue'

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

// ── Backup & restore (full account export / import) ──
const transfer = useDataTransfer()
const fileInput = ref(null)
const selectedFile = ref(null)
const pendingBackup = ref(null)
const restoreMode = ref('merge')
const pendingCounts = computed(() => (pendingBackup.value ? transfer.countRecords(pendingBackup.value.data) : null))

async function onExport() {
  try {
    const r = await transfer.exportToFile()
    if (r) {
      const c = r.counts
      toast.success(`Backup ${r.method === 'share' ? 'saved' : 'downloaded'} — ${c.months} months, ${c.dailyExpenses} daily expenses, ${c.bankAccounts} accounts, ${c.investments} investments`)
    }
  }
  catch (e) {
    toast.error(`Export failed: ${e?.message || 'unknown error'}`)
  }
}

async function onPickFile(e) {
  if (transfer.importing.value) return
  const file = e.target.files?.[0] || null
  selectedFile.value = file
  pendingBackup.value = null
  if (!file) return
  try {
    pendingBackup.value = await transfer.readBackupFile(file)
  }
  catch (err) {
    toast.error(err?.message || 'Could not read that file')
    clearFile()
  }
}

function clearFile() {
  if (transfer.importing.value) return
  selectedFile.value = null
  pendingBackup.value = null
  restoreMode.value = 'merge'
  if (fileInput.value) fileInput.value.value = ''
}

async function onRestore() {
  const backup = pendingBackup.value
  if (!backup) return toast.error('Choose a backup file first')
  const mode = restoreMode.value || 'merge'
  const c = pendingCounts.value
  const summary = `${c.months} months, ${c.dailyExpenses} daily expenses, ${c.bankAccounts} accounts, ${c.investments} investments`
  const totalRecords = c.bankAccounts + c.investments + c.months + c.dailyExpenses + c.planVersions + c.investmentPlanVersions

  if (mode === 'replace') {
    if (totalRecords === 0) {
      return toast.error('This backup has no records — refusing to replace, as it would erase your account and restore nothing.')
    }
    if (!window.confirm(`Replace ALL current data with this backup (${summary})?\n\nEverything in your account that isn't in this backup will be permanently deleted. This cannot be undone.`)) return
    if (window.prompt('Type REPLACE to confirm wiping your current data and restoring this backup:') !== 'REPLACE') {
      return toast.error('Restore cancelled — confirmation did not match')
    }
  }
  else if (!window.confirm(`Merge this backup into your data (${summary})?\n\nRecords with matching IDs are overwritten; nothing is deleted.`)) {
    return
  }

  try {
    await transfer.restore(backup, mode)
    toast.success(mode === 'replace' ? 'Account replaced from backup' : 'Backup merged into your account')
    clearFile()
  }
  catch (e) {
    toast.error(`Restore failed: ${e?.message || 'unknown error'}`)
  }
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

async function loadDailyExpenses() {
  if (importer.running.value) return
  if (!window.confirm(`Load daily expenses for all available months (Feb–Jun 2026) from the spreadsheet? Months that already have daily expenses are skipped — nothing else is touched.`)) return
  try {
    const r = await importer.runDailyOnly()
    toast.success(`Loaded daily expenses for ${r.imported} month(s); skipped ${r.skipped} already loaded`)
  }
  catch (e) {
    toast.error(`Daily import failed: ${e?.message || 'unknown error'}`)
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

    <!-- Backup & restore -->
    <UiCard>
      <UiCardHeader>
        <UiCardTitle>Backup &amp; restore</UiCardTitle>
        <UiCardDescription>
          Download a full backup of your account as a JSON file, or restore from one. Includes settings, bank accounts, investments, every month and its daily expenses, and your full plan history.
        </UiCardDescription>
      </UiCardHeader>
      <UiCardContent class="space-y-6">
        <!-- Export -->
        <div class="space-y-2">
          <UiLabel>Export</UiLabel>
          <div>
            <UiButton variant="outline" :disabled="transfer.exporting.value" @click="onExport">
              <DownloadIcon class="size-4" />
              {{ transfer.exporting.value ? 'Preparing…' : 'Download backup (.json)' }}
            </UiButton>
          </div>
          <p class="text-sm text-muted-foreground">Saves everything to a file on this device. Keep it somewhere safe.</p>
        </div>

        <!-- Restore -->
        <div class="space-y-3 border-t pt-4">
          <UiLabel>Restore</UiLabel>
          <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="onPickFile">
          <div class="flex flex-wrap items-center gap-3">
            <UiButton variant="outline" type="button" :disabled="transfer.importing.value" @click="fileInput?.click()">
              <UploadIcon class="size-4" />
              Choose backup file…
            </UiButton>
            <button v-if="selectedFile" type="button" :disabled="transfer.importing.value" class="text-sm text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50" @click="clearFile">Clear</button>
          </div>

          <div v-if="pendingBackup" class="space-y-3 rounded-md border p-3">
            <p class="text-sm text-muted-foreground">
              <span class="font-medium text-foreground">{{ selectedFile?.name }}</span>
              <template v-if="pendingBackup.exportedAt"> · backed up {{ String(pendingBackup.exportedAt).slice(0, 10) }}</template>
            </p>
            <p v-if="pendingCounts" class="text-sm text-muted-foreground">
              {{ pendingCounts.months }} months · {{ pendingCounts.dailyExpenses }} daily expenses · {{ pendingCounts.bankAccounts }} accounts · {{ pendingCounts.investments }} investments
            </p>

            <div class="space-y-1.5">
              <UiLabel>How to restore</UiLabel>
              <UiToggleGroup v-model="restoreMode" type="single" variant="outline">
                <UiToggleGroupItem value="merge" class="px-4">Merge</UiToggleGroupItem>
                <UiToggleGroupItem value="replace" class="px-4">Replace</UiToggleGroupItem>
              </UiToggleGroup>
              <p class="text-xs text-muted-foreground">
                {{ restoreMode === 'replace'
                  ? 'Makes your account an exact copy of this backup — restores its records, then removes anything not in it.'
                  : 'Adds and overwrites records from the backup; anything not in the file is kept.' }}
              </p>
            </div>

            <div class="flex items-center gap-3">
              <UiButton :variant="restoreMode === 'replace' ? 'destructive' : 'default'" :disabled="transfer.importing.value" @click="onRestore">
                {{ transfer.importing.value ? (transfer.status.value || 'Restoring…') : (restoreMode === 'replace' ? 'Replace from this file' : 'Merge from this file') }}
              </UiButton>
            </div>
          </div>
          <p v-else class="text-sm text-muted-foreground">Pick a <code>.json</code> backup to merge into or replace your current data.</p>
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

    <!-- Daily-expenses-only import (temporary) -->
    <UiCard class="border-dashed">
      <UiCardHeader>
        <UiCardTitle>Load daily expenses</UiCardTitle>
        <UiCardDescription>Loads only the daily-expense log for each available month (Feb–Jun 2026) from your spreadsheet. Months that already have daily expenses are skipped, so it never duplicates rows.</UiCardDescription>
      </UiCardHeader>
      <UiCardContent class="flex items-center gap-3">
        <UiButton variant="outline" :disabled="importer.running.value" @click="loadDailyExpenses">
          {{ importer.running.value ? 'Loading…' : 'Load daily expenses' }}
        </UiButton>
        <span v-if="importer.dailyStatus.value" class="text-sm text-muted-foreground">{{ importer.dailyStatus.value }}</span>
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
