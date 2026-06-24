<script setup>
// App shell (§11): desktop sidebar + top bar; mobile bottom tab bar with a
// center "+" quick-add. Also hosts the first-run onboarding gate (pick currency
// + theme before using the app).
import { ref, computed } from 'vue'
import {
  HomeIcon, LandmarkIcon, NotebookPenIcon, CalendarDaysIcon, SettingsIcon,
  PlusIcon, SunIcon, MoonIcon, LogOutIcon, TrendingUpIcon, LineChartIcon,
} from '@lucide/vue'
import fLogo from '@/assets/f.png'
import { currentMonthId } from '@/lib/dates.js'
import { DEFAULT_CURRENCY } from '@/domain/currencies.js'
import { dailyExpensesRepo } from '@/repositories/dailyExpenses.js'

const route = useRoute()
const auth = useAuthStore()
const { isDark, toggle: toggleTheme } = useTheme()
const { ready, hasSettings, ensureCreated } = useSettings()

const nav = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/bank_accounts', label: 'Accounts', icon: LandmarkIcon },
  { to: '/plan-designer', label: 'Plans', icon: NotebookPenIcon },
  { to: '/investments', label: 'Investments', icon: TrendingUpIcon },
  { to: '/months', label: 'Months', icon: CalendarDaysIcon },
  { to: '/insights', label: 'Insights', icon: LineChartIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]
// Curated 4 for the mobile bottom bar (around the center "+"). Accounts lives in
// the mobile top bar instead.
const mobileNav = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/plan-designer', label: 'Plans', icon: NotebookPenIcon },
  { to: '/investments', label: 'Investments', icon: TrendingUpIcon },
  { to: '/months', label: 'Months', icon: CalendarDaysIcon },
]
// Global quick-add: the bottom-bar "+" opens the add-expense sheet for the
// current month (today pre-selected) instead of navigating to the daily screen.
const curMonthId = computed(() => currentMonthId())
const { month: quickMonth } = useMonth(curMonthId)
const quickAdd = ref(false)
function quickSave(payload) {
  const u = auth.user?.uid
  const c = quickMonth.value?.currency
  if (!u || !c) throw new Error('Month not ready')
  return dailyExpensesRepo.add(u, curMonthId.value, payload, c)
}

function isActive(to) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}
async function onSignOut() {
  await auth.logout()
  await navigateTo('/login')
}

// ── Onboarding ──────────────────────────────────────────────────────────────
const showOnboarding = computed(() => ready.value && !hasSettings.value)
const onboardCurrency = ref(DEFAULT_CURRENCY)
const onboarding = ref(false)
async function completeOnboarding() {
  if (onboarding.value) return
  onboarding.value = true
  try {
    await ensureCreated({ currency: onboardCurrency.value })
  }
  finally {
    onboarding.value = false
  }
}
</script>

<template>
  <!-- First-run onboarding gate -->
  <div v-if="showOnboarding" class="flex min-h-svh items-center justify-center bg-background p-4">
    <UiCard class="w-full max-w-md">
      <UiCardHeader>
        <img :src="fLogo" alt="Finina" class="mb-2 size-10">
        <UiCardTitle>Welcome to Finina</UiCardTitle>
        <UiCardDescription>Pick your default currency to get started. You can change it later in Settings.</UiCardDescription>
      </UiCardHeader>
      <UiCardContent class="space-y-4">
        <div class="space-y-1.5">
          <UiLabel for="onboard-currency">Default currency</UiLabel>
          <CurrencySelect id="onboard-currency" v-model="onboardCurrency" />
          <p class="text-xs text-muted-foreground">
            A sample amount looks like:
            <MoneyValue :amount="123456789" :currency="onboardCurrency" class="font-medium" />
          </p>
        </div>
        <div class="flex items-center justify-between rounded-md border p-3">
          <div>
            <p class="text-sm font-medium">Theme</p>
            <p class="text-xs text-muted-foreground">{{ isDark ? 'Dark' : 'Light' }}</p>
          </div>
          <UiButton variant="outline" size="icon" aria-label="Toggle theme" @click="toggleTheme">
            <MoonIcon v-if="isDark" class="size-4" />
            <SunIcon v-else class="size-4" />
          </UiButton>
        </div>
      </UiCardContent>
      <UiCardFooter>
        <UiButton class="w-full" :disabled="onboarding" @click="completeOnboarding">
          {{ onboarding ? 'Setting up…' : 'Continue' }}
        </UiButton>
      </UiCardFooter>
    </UiCard>
  </div>

  <!-- App shell -->
  <div v-else class="min-h-svh bg-background">
    <!-- Desktop sidebar (fixed, full height) -->
    <aside class="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-sidebar md:flex">
      <div class="flex h-14 items-center border-b px-4">
        <span class="flex items-baseline text-lg font-semibold" aria-label="Finina">
          <img :src="fLogo" alt="" aria-hidden="true" class="size-7">
          <span aria-hidden="true" class="-ml-1">inina</span>
        </span>
      </div>
      <nav class="flex-1 space-y-1 p-3">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
          :class="isActive(item.to) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'"
        >
          <component :is="item.icon" class="size-4" />
          {{ item.label }}
        </NuxtLink>
      </nav>
      <div class="border-t p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-xs font-medium">{{ auth.user?.email || 'Signed in' }}</p>
          </div>
          <div class="flex items-center gap-1">
            <UiButton variant="ghost" size="icon" class="size-8" aria-label="Toggle theme" @click="toggleTheme">
              <MoonIcon v-if="isDark" class="size-4" />
              <SunIcon v-else class="size-4" />
            </UiButton>
            <UiButton variant="ghost" size="icon" class="size-8" aria-label="Sign out" @click="onSignOut">
              <LogOutIcon class="size-4" />
            </UiButton>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main column (offset by the fixed sidebar on desktop) -->
    <div class="flex min-h-svh min-w-0 flex-col md:pl-60">
      <!-- Mobile top bar -->
      <header class="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur md:hidden">
        <div class="flex items-center">
          <span class="flex items-baseline text-lg font-semibold" aria-label="Finina">
            <img :src="fLogo" alt="" aria-hidden="true" class="size-7">
            <span aria-hidden="true" class="-ml-1">inina</span>
          </span>
        </div>
        <div class="flex items-center gap-1">
          <UiButton variant="ghost" size="icon" class="size-9" aria-label="Insights" as-child>
            <NuxtLink to="/insights"><LineChartIcon class="size-4" /></NuxtLink>
          </UiButton>
          <UiButton variant="ghost" size="icon" class="size-9" aria-label="Bank accounts" as-child>
            <NuxtLink to="/bank_accounts"><LandmarkIcon class="size-4" /></NuxtLink>
          </UiButton>
          <UiButton variant="ghost" size="icon" class="size-9" aria-label="Toggle theme" @click="toggleTheme">
            <MoonIcon v-if="isDark" class="size-4" />
            <SunIcon v-else class="size-4" />
          </UiButton>
          <UiButton variant="ghost" size="icon" class="size-9" aria-label="Settings" as-child>
            <NuxtLink to="/settings"><SettingsIcon class="size-4" /></NuxtLink>
          </UiButton>
          <UiButton variant="ghost" size="icon" class="size-9" aria-label="Sign out" @click="onSignOut">
            <LogOutIcon class="size-4" />
          </UiButton>
        </div>
      </header>

      <main class="flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-8 md:pt-6">
        <div class="mx-auto w-full max-w-6xl">
          <slot />
        </div>
      </main>
    </div>

    <!-- Mobile bottom tab bar -->
    <nav class="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t bg-background/95 px-2 py-1.5 backdrop-blur md:hidden">
      <NuxtLink
        v-for="item in mobileNav.slice(0, 2)"
        :key="item.to"
        :to="item.to"
        class="flex flex-1 flex-col items-center gap-0.5 rounded-md py-1 text-[10px]"
        :class="isActive(item.to) ? 'text-primary' : 'text-muted-foreground'"
      >
        <component :is="item.icon" class="size-5" />
        {{ item.label }}
      </NuxtLink>

      <button type="button" class="flex flex-col items-center" aria-label="Quick add expense" @click="quickAdd = true">
        <span class="-mt-5 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
          <PlusIcon class="size-6" />
        </span>
      </button>

      <NuxtLink
        v-for="item in mobileNav.slice(2, 4)"
        :key="item.to"
        :to="item.to"
        class="flex flex-1 flex-col items-center gap-0.5 rounded-md py-1 text-[10px]"
        :class="isActive(item.to) ? 'text-primary' : 'text-muted-foreground'"
      >
        <component :is="item.icon" class="size-5" />
        {{ item.label }}
      </NuxtLink>
    </nav>

    <!-- Global quick add-expense sheet (mobile "+") -->
    <ExpenseFormDialog v-model:open="quickAdd" :month-id="curMonthId" :month-doc="quickMonth" :on-save="quickSave" />
  </div>
</template>
