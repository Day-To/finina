<script setup>
// S1 — Home dashboard (§7). This month at a glance: headline stats, daily budget,
// where this month's income goes, a month-on-month trend, and recent expenses.
import { computed, ref } from 'vue'
import { CalendarPlusIcon, PlusIcon, ArrowRightIcon } from '@lucide/vue'
import { totalExpenses, surplus, investmentPools } from '@/domain/calc/index.js'
import { fromMinor } from '@/domain/money.js'
import { formatMonthLabel, shortMonthLabel, formatDateLabel, elapsedDaysInMonth } from '@/lib/dates.js'

const { loading, isEmpty, analysis, currentMonth, thisMonthId } = useHomeAnalysis()
const { currency: fallbackCurrency, locale } = useSettings()
// Daily figures + add for the current month.
const { expenses: dailyExpenses, summary: dailySummary, add: addDaily } = useDaily(() => thisMonthId.value, currentMonth)

const monthCurrency = computed(() => currentMonth.value?.currency || fallbackCurrency.value)
const monthLabel = computed(() => formatMonthLabel(thisMonthId.value, locale.value))

const incomeAmount = computed(() => currentMonth.value?.income ?? 0)
const expensesAmount = computed(() => (currentMonth.value ? totalExpenses(currentMonth.value) : 0))
const surplusAmount = computed(() => (currentMonth.value ? surplus(currentMonth.value) : 0))
const investedAmount = computed(() => {
  if (!currentMonth.value) return 0
  const p = investmentPools(currentMonth.value)
  return p.mf + p.stocks
})
const savingsRate = computed(() => (incomeAmount.value > 0 ? surplusAmount.value / incomeAmount.value : 0))

// Expenses delta -> "+12% vs last month".
const expensesDelta = computed(() => analysis.value.latest?.expensesDelta ?? null)
const expensesHint = computed(() => {
  const d = expensesDelta.value
  if (d == null) return ''
  const pct = Math.round(d * 100)
  return `${pct >= 0 ? '+' : ''}${pct}% vs last month`
})
const expensesHintVariant = computed(() => {
  const d = expensesDelta.value
  if (d == null || d === 0) return 'muted'
  return d > 0 ? 'negative' : 'positive'
})

// ── "Where your income goes" donut (current month) ──
const incomeSplit = computed(() => {
  const kept = Math.max(0, incomeAmount.value - expensesAmount.value - investedAmount.value)
  return [
    { label: 'Expenses', value: expensesAmount.value, color: 'var(--negative)' },
    { label: 'Invested', value: investedAmount.value, color: 'var(--positive)' },
    { label: 'Kept', value: kept, color: 'var(--auto)' },
  ]
})

// ── Trend (income vs expenses, last 6 months) ──
const trend = computed(() => analysis.value.series.slice(-6))
const trendData = computed(() => trend.value.map((s) => ({ label: shortMonthLabel(s.month, locale.value), values: [s.income, s.expenses] })))
const trendSeries = [{ name: 'Income', color: 'var(--auto)' }, { name: 'Expenses', color: 'var(--negative)' }]
const compact = (minor) => {
  try { return new Intl.NumberFormat(locale.value || undefined, { style: 'currency', currency: monthCurrency.value, notation: 'compact', maximumFractionDigits: 1 }).format(fromMinor(minor || 0, monthCurrency.value)) }
  catch { return String(Math.round(fromMinor(minor || 0, monthCurrency.value || 'USD'))) }
}

const recentExpenses = computed(() => dailyExpenses.value.slice(0, 5))
const setupHref = computed(() => `/months/${thisMonthId.value}`)

// Add-expense sheet
const addOpen = ref(false)
const onSaveExpense = (payload) => addDaily(payload)
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Home</h1>
      <p class="text-sm text-muted-foreground">{{ monthLabel }}</p>
    </div>

    <!-- Loading -->
    <template v-if="loading">
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4"><UiSkeleton v-for="i in 4" :key="i" class="h-24" /></div>
      <div class="grid gap-4 md:grid-cols-2"><UiSkeleton class="h-44" /><UiSkeleton class="h-44" /></div>
    </template>

    <!-- Empty -->
    <EmptyState v-else-if="isEmpty" title="Plan your money" description="Design a plan and set up your first month to see your income, expenses, and daily budget at a glance.">
      <template #icon><CalendarPlusIcon class="size-6" /></template>
      <UiButton as-child><NuxtLink to="/plan-designer">Create a plan</NuxtLink></UiButton>
      <UiButton as-child variant="outline"><NuxtLink to="/months">Set up a month</NuxtLink></UiButton>
    </EmptyState>

    <template v-else>
      <!-- Stat tiles -->
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Income" :loading="loading"><MoneyValue :amount="incomeAmount" :currency="monthCurrency" /></StatTile>
        <StatTile label="Expenses" :hint="expensesHint" :hint-variant="expensesHintVariant" :loading="loading"><MoneyValue :amount="expensesAmount" :currency="monthCurrency" /></StatTile>
        <StatTile label="Surplus" :loading="loading"><MoneyValue :amount="surplusAmount" :currency="monthCurrency" variant="auto" /></StatTile>
        <StatTile label="Daily remaining" :loading="loading"><MoneyValue :amount="dailySummary.remaining" :currency="monthCurrency" variant="auto" /></StatTile>
      </div>

      <!-- Month not set up yet -->
      <UiCard v-if="!currentMonth">
        <UiCardHeader>
          <UiCardTitle>This month isn't set up yet</UiCardTitle>
          <UiCardDescription>Materialize {{ monthLabel }} from your plans to start tracking income, expenses, and your daily budget.</UiCardDescription>
        </UiCardHeader>
        <UiCardFooter><UiButton as-child><NuxtLink :to="setupHref">Set up {{ monthLabel }}</NuxtLink></UiButton></UiCardFooter>
      </UiCard>

      <!-- Budget + income split -->
      <div class="grid gap-4 md:grid-cols-2">
        <UiCard>
          <UiCardHeader>
            <UiCardTitle>This month's budget</UiCardTitle>
            <UiCardDescription>Your daily-budget pool versus what you've spent.</UiCardDescription>
          </UiCardHeader>
          <UiCardContent>
            <BudgetMeter :budget="dailySummary.budget" :spent="dailySummary.spent" :currency="monthCurrency" :per-day="dailySummary.perDay" :elapsed-days="elapsedDaysInMonth(thisMonthId)" />
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader>
            <div class="flex items-start justify-between gap-2">
              <div>
                <UiCardTitle>Where your income goes</UiCardTitle>
                <UiCardDescription>{{ monthLabel }} · {{ Math.round(savingsRate * 100) }}% kept as surplus</UiCardDescription>
              </div>
            </div>
          </UiCardHeader>
          <UiCardContent>
            <ChartDonut v-if="incomeAmount > 0" :slices="incomeSplit" :currency="monthCurrency" center-label="Income" :size="140" />
            <p v-else class="py-6 text-center text-sm text-muted-foreground">Set this month's income to see the breakdown.</p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Trend -->
      <UiCard>
        <UiCardHeader>
          <div class="flex items-start justify-between gap-2">
            <div>
              <UiCardTitle>Income vs expenses</UiCardTitle>
              <UiCardDescription>Last {{ trend.length }} month{{ trend.length === 1 ? '' : 's' }}.</UiCardDescription>
            </div>
            <UiButton as-child variant="ghost" size="sm" class="text-muted-foreground">
              <NuxtLink to="/insights">Insights <ArrowRightIcon class="size-4" /></NuxtLink>
            </UiButton>
          </div>
        </UiCardHeader>
        <UiCardContent>
          <ChartBar v-if="trend.length" :data="trendData" :series="trendSeries" :currency="monthCurrency" :format-axis="compact" :height="200" />
          <p v-else class="text-sm text-muted-foreground">Not enough data to show a trend yet.</p>
        </UiCardContent>
      </UiCard>

      <!-- Recent -->
      <UiCard>
        <UiCardHeader>
          <div class="flex items-start justify-between gap-2">
            <div>
              <UiCardTitle>Recent</UiCardTitle>
              <UiCardDescription>Your latest daily expenses.</UiCardDescription>
            </div>
            <UiButton variant="outline" size="sm" :disabled="!currentMonth" @click="addOpen = true"><PlusIcon class="size-4" /> Add expense</UiButton>
          </div>
        </UiCardHeader>
        <UiCardContent>
          <ul v-if="recentExpenses.length" class="divide-y">
            <li v-for="exp in recentExpenses" :key="exp.id" class="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">{{ exp.item }}</p>
                <p class="text-xs text-muted-foreground">{{ formatDateLabel(exp.date, locale) }}</p>
              </div>
              <MoneyValue :amount="exp.amount" :currency="exp.currency || monthCurrency" class="text-sm" />
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">No expenses logged yet this month.</p>
        </UiCardContent>
      </UiCard>
    </template>

    <ExpenseFormDialog v-model:open="addOpen" :month-id="thisMonthId" :month-doc="currentMonth" :on-save="onSaveExpense" />
  </div>
</template>
