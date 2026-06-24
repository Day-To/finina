<script setup>
// S12 — Insights. Cross-month analytics: cash flow, savings rate, expense
// breakdown, daily spending, investments, surplus allocation + auto observations.
// Pure aggregation lives in domain/calc/analytics.js; charts in shared/charts.
import { computed } from 'vue'
import { TrendingUpIcon, TrendingDownIcon, PiggyBankIcon, WalletIcon, ReceiptIcon, CoinsIcon, SparklesIcon, LineChartIcon } from '@lucide/vue'
import {
  monthlySeries, analyticsKpis, expenseCategories, fixedVsVariable,
  surplusAllocationSeries, investmentSeries, investedByType, investedByBucket, dailyAnalysis, dailyBudget,
} from '@/domain/calc/index.js'
import { fromMinor, formatMoney } from '@/domain/money.js'
import { shortMonthLabel, formatMonthLabel } from '@/lib/dates.js'

const { months, dailyByMonth, loading } = useAnalytics()
const { investments } = useInvestments()
const { currency: settingsCurrency, locale } = useSettings()

const cur = computed(() => months.value[0]?.currency || settingsCurrency.value || 'USD')
const sortedMonths = computed(() => [...months.value].sort((a, b) => (a.month < b.month ? -1 : 1)))
const hasData = computed(() => months.value.length > 0)

const short = (m) => shortMonthLabel(m, locale.value)
const money = (m) => formatMoney(m || 0, cur.value, locale.value)
const monthLabel = (m) => formatMonthLabel(m, locale.value)
const compact = (minor) => {
  try { return new Intl.NumberFormat(locale.value || undefined, { style: 'currency', currency: cur.value, notation: 'compact', maximumFractionDigits: 1 }).format(fromMinor(minor || 0, cur.value)) }
  catch { return String(Math.round(fromMinor(minor || 0, cur.value))) }
}

const PALETTE = ['var(--chart-1)', 'var(--chart-4)', 'var(--chart-2)', 'var(--chart-5)', 'var(--chart-3)', 'var(--auto)', 'var(--positive)', 'var(--primary)']
const C = { income: 'var(--auto)', expenses: 'var(--negative)', surplus: 'var(--positive)', invest: 'var(--positive)', stocks: 'var(--chart-4)', budget: 'var(--muted-foreground)' }

// ── Aggregates ────────────────────────────────────────────────────────────────
const series = computed(() => monthlySeries(months.value))
const kpis = computed(() => analyticsKpis(series.value))
// Exclude daily-budget variable lines — they mirror the daily spending pool
// (charted separately below) and would otherwise always top the ranking.
const expenseCats = computed(() => expenseCategories(months.value, 8, { excludeDailyBudget: true }))
const fixedVar = computed(() => fixedVsVariable(months.value))
const surplusAlloc = computed(() => surplusAllocationSeries(months.value))
const invSeries = computed(() => investmentSeries(months.value))
const invType = computed(() => investedByType(months.value))
const invBucket = computed(() => investedByBucket(months.value, investments.value))
const daily = computed(() => dailyAnalysis(dailyByMonth.value))

// ── Chart data ────────────────────────────────────────────────────────────────
const cashflowData = computed(() => series.value.map((s) => ({ label: short(s.month), values: [s.income, s.expenses] })))
const cashflowSeries = [{ name: 'Income', color: C.income }, { name: 'Expenses', color: C.expenses }]

const savingsData = computed(() => series.value.map((s) => ({ label: short(s.month), values: [s.savingsRate] })))
const savingsSeries = [{ name: 'Savings rate', color: C.surplus, area: true }]

const fixedVarData = computed(() => series.value.map((s) => ({ label: short(s.month), values: [s.fixed, s.variable] })))
const fixedVarSeries = [{ name: 'Fixed', color: PALETTE[0] }, { name: 'Variable', color: PALETTE[1] }]
const fixedVarSlices = computed(() => [{ label: 'Fixed', value: fixedVar.value.fixed, color: PALETTE[0] }, { label: 'Variable', value: fixedVar.value.variable, color: PALETTE[1] }])

const categoryRows = computed(() => expenseCats.value.map((r, i) => ({ label: r.item, value: r.total, color: PALETTE[i % PALETTE.length], sub: r.fixed && r.variable ? 'mixed' : r.variable ? 'variable' : 'fixed' })))

const dailyData = computed(() => sortedMonths.value.map((m) => ({ label: short(m.month), values: [daily.value.byMonth[m.month] || 0, dailyBudget(m)] })))
const dailySeries = [{ name: 'Spent', color: C.expenses }, { name: 'Budget', color: C.budget }]
const dailyRows = computed(() => daily.value.items.slice(0, 8).map((r, i) => ({ label: r.item, value: r.total, sub: `${r.count}×`, color: PALETTE[i % PALETTE.length] })))
const hasDaily = computed(() => daily.value.count > 0)

const cumulativeData = computed(() => invSeries.value.map((s) => ({ label: short(s.month), values: [s.cumulative] })))
const cumulativeSeries = [{ name: 'Invested to date', color: C.invest, area: true }]
const investedPerMonthData = computed(() => invSeries.value.map((s) => ({ label: short(s.month), values: [s.mf, s.stocks] })))
const investedPerMonthSeries = [{ name: 'Mutual funds', color: C.invest }, { name: 'Stocks', color: C.stocks }]
// Investing rate = share of income put into investments, month on month.
const investRateData = computed(() => series.value.map((s) => ({ label: short(s.month), values: [s.investRate] })))
const investRateSeries = [{ name: 'Investing rate', color: C.invest, area: true }]
const typeSlices = computed(() => [{ label: 'Mutual funds', value: invType.value.mf, color: C.invest }, { label: 'Stocks', value: invType.value.stocks, color: C.stocks }])
const bucketSlices = computed(() => invBucket.value.map((b, i) => ({ label: b.bucket, value: b.amount, color: PALETTE[i % PALETTE.length] })))
const hasInvest = computed(() => invType.value.total > 0)

const allocData = computed(() => surplusAlloc.value.series.map((row) => ({ label: short(row.month), values: surplusAlloc.value.items.map((it) => row.values[it] || 0) })))
const allocSeries = computed(() => surplusAlloc.value.items.map((it, i) => ({ name: it, color: PALETTE[i % PALETTE.length] })))

// ── KPI cards ─────────────────────────────────────────────────────────────────
const incomeSpark = computed(() => series.value.map((s) => s.income))
const expenseSpark = computed(() => series.value.map((s) => s.expenses))
const savingsSpark = computed(() => series.value.map((s) => s.savingsRate))
const investSpark = computed(() => series.value.map((s) => s.invested))

// ── Narrative observations ────────────────────────────────────────────────────
const overspendMonths = computed(() => sortedMonths.value.filter((m) => (daily.value.byMonth[m.month] || 0) > dailyBudget(m) && dailyBudget(m) > 0).length)
const insights = computed(() => {
  const k = kpis.value
  if (!k) return []
  const out = []
  const sr = Math.round(k.overallSavingsRate * 100)
  out.push({ icon: PiggyBankIcon, tone: sr >= 20 ? 'positive' : sr >= 0 ? 'muted' : 'negative', text: `You've kept ${money(k.totalSurplus)} as surplus over ${k.months} month${k.months > 1 ? 's' : ''} — an overall savings rate of ${sr}%.` })
  if (k.months > 1) {
    const d = Math.round(k.savingsRateDelta * 100)
    out.push({ icon: d >= 0 ? TrendingUpIcon : TrendingDownIcon, tone: d >= 0 ? 'positive' : 'negative', text: `Your savings rate ${d >= 0 ? 'improved' : 'dropped'} ${Math.abs(d)} points from ${short(k.first.month)} to ${short(k.last.month)}.` })
    out.push({ icon: LineChartIcon, tone: 'muted', text: `Strongest month was ${monthLabel(k.best.month)} (${money(k.best.surplus)} surplus); tightest was ${monthLabel(k.worst.month)} (${money(k.worst.surplus)}).` })
  }
  const top = expenseCats.value[0]
  if (top) out.push({ icon: ReceiptIcon, tone: 'muted', text: `${top.item} is your biggest expense line at ${money(top.total)} in total.` })
  if (k.totalInvested > 0) out.push({ icon: CoinsIcon, tone: 'positive', text: `You've invested ${money(k.totalInvested)} — about ${Math.round(k.investedShareOfIncome * 100)}% of your income.` })
  if (hasDaily.value && overspendMonths.value > 0) out.push({ icon: WalletIcon, tone: 'negative', text: `Daily spending exceeded the budget in ${overspendMonths.value} month${overspendMonths.value > 1 ? 's' : ''}.` })
  return out
})
const toneClass = { positive: 'text-positive', negative: 'text-negative', muted: 'text-muted-foreground' }
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Insights</h1>
      <p class="text-sm text-muted-foreground">What your months say about your money.</p>
    </div>

    <!-- Loading -->
    <div v-if="loading && !hasData" class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><UiSkeleton v-for="i in 4" :key="i" class="h-28" /></div>
      <UiSkeleton class="h-72 w-full" />
      <UiSkeleton class="h-72 w-full" />
    </div>

    <!-- Empty -->
    <UiCard v-else-if="!hasData">
      <UiCardHeader>
        <UiCardTitle>No data to analyze yet</UiCardTitle>
        <UiCardDescription>Once you have a tracked month or two, this page fills with charts and insights. Generate a month from your plan, or load past data from Settings.</UiCardDescription>
      </UiCardHeader>
      <UiCardFooter class="flex gap-2">
        <UiButton as-child><NuxtLink to="/months">Go to Months</NuxtLink></UiButton>
        <UiButton variant="outline" as-child><NuxtLink to="/settings">Settings</NuxtLink></UiButton>
      </UiCardFooter>
    </UiCard>

    <template v-else>
      <!-- KPI cards -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UiCard>
          <UiCardContent class="space-y-2 pt-6">
            <p class="text-xs uppercase tracking-wide text-muted-foreground">Avg income</p>
            <p class="text-xl font-bold"><MoneyValue :amount="Math.round(kpis.avgIncome)" :currency="cur" /></p>
            <ChartSparkline :values="incomeSpark" :color="C.income" />
            <p class="text-xs text-muted-foreground">per month · {{ kpis.months }} months</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardContent class="space-y-2 pt-6">
            <p class="text-xs uppercase tracking-wide text-muted-foreground">Avg expenses</p>
            <p class="text-xl font-bold"><MoneyValue :amount="Math.round(kpis.avgExpenses)" :currency="cur" /></p>
            <ChartSparkline :values="expenseSpark" :color="C.expenses" />
            <p class="text-xs text-muted-foreground">{{ Math.round((kpis.totalExpenses / (kpis.totalIncome || 1)) * 100) }}% of income</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardContent class="space-y-2 pt-6">
            <p class="text-xs uppercase tracking-wide text-muted-foreground">Savings rate</p>
            <p class="text-xl font-bold text-positive">{{ Math.round(kpis.overallSavingsRate * 100) }}%</p>
            <ChartSparkline :values="savingsSpark" :color="C.surplus" />
            <p class="text-xs text-muted-foreground">{{ money(kpis.totalSurplus) }} saved</p>
          </UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardContent class="space-y-2 pt-6">
            <p class="text-xs uppercase tracking-wide text-muted-foreground">Invested</p>
            <p class="text-xl font-bold"><MoneyValue :amount="kpis.totalInvested" :currency="cur" variant="total" /></p>
            <ChartSparkline :values="investSpark" :color="C.invest" />
            <p class="text-xs text-muted-foreground">{{ Math.round(kpis.investedShareOfIncome * 100) }}% of income</p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Observations -->
      <UiCard v-if="insights.length">
        <UiCardHeader><UiCardTitle class="flex items-center gap-2 text-base"><SparklesIcon class="size-4 text-primary" /> Observations</UiCardTitle></UiCardHeader>
        <UiCardContent>
          <ul class="space-y-2.5">
            <li v-for="(o, i) in insights" :key="i" class="flex items-start gap-2.5 text-sm">
              <component :is="o.icon" class="mt-0.5 size-4 shrink-0" :class="toneClass[o.tone]" />
              <span>{{ o.text }}</span>
            </li>
          </ul>
        </UiCardContent>
      </UiCard>

      <!-- Cash flow + savings rate -->
      <div class="grid gap-4 lg:grid-cols-2">
        <UiCard>
          <UiCardHeader><UiCardTitle class="text-base">Income vs expenses</UiCardTitle><UiCardDescription>Month by month.</UiCardDescription></UiCardHeader>
          <UiCardContent><ChartBar :data="cashflowData" :series="cashflowSeries" :currency="cur" :format-axis="compact" /></UiCardContent>
        </UiCard>
        <UiCard>
          <UiCardHeader><UiCardTitle class="text-base">Savings rate</UiCardTitle><UiCardDescription>Surplus as a share of income.</UiCardDescription></UiCardHeader>
          <UiCardContent><ChartLine :data="savingsData" :series="savingsSeries" pct /></UiCardContent>
        </UiCard>
      </div>

      <!-- Expense breakdown -->
      <UiCard>
        <UiCardHeader><UiCardTitle class="text-base">Where the money goes</UiCardTitle><UiCardDescription>Fixed vs variable over time, top lines, and the overall split.</UiCardDescription></UiCardHeader>
        <UiCardContent class="grid gap-8 lg:grid-cols-2">
          <div class="space-y-6">
            <ChartBar :data="fixedVarData" :series="fixedVarSeries" stacked :currency="cur" :format-axis="compact" />
            <ChartDonut :slices="fixedVarSlices" :currency="cur" center-label="Expenses" />
          </div>
          <div>
            <p class="mb-3 text-sm font-medium text-muted-foreground">Top expense lines</p>
            <ChartRankBars :rows="categoryRows" :currency="cur" />
          </div>
        </UiCardContent>
      </UiCard>

      <!-- Daily spending -->
      <UiCard v-if="hasDaily">
        <UiCardHeader><UiCardTitle class="text-base">Daily spending</UiCardTitle><UiCardDescription>Day-to-day spend against the budget, and where it went.</UiCardDescription></UiCardHeader>
        <UiCardContent class="grid gap-8 lg:grid-cols-2">
          <div><p class="mb-3 text-sm font-medium text-muted-foreground">Spent vs budget</p><ChartBar :data="dailyData" :series="dailySeries" :currency="cur" :format-axis="compact" /></div>
          <div><p class="mb-3 text-sm font-medium text-muted-foreground">Top daily items</p><ChartRankBars :rows="dailyRows" :currency="cur" /></div>
        </UiCardContent>
      </UiCard>

      <!-- Investments -->
      <UiCard v-if="hasInvest">
        <UiCardHeader><UiCardTitle class="text-base">Investments</UiCardTitle><UiCardDescription>Money put to work — growth, type split, and by goal.</UiCardDescription></UiCardHeader>
        <UiCardContent class="space-y-8">
          <div><p class="mb-3 text-sm font-medium text-muted-foreground">Invested to date</p><ChartLine :data="cumulativeData" :series="cumulativeSeries" :currency="cur" :format-axis="compact" /></div>
          <div class="grid gap-8 lg:grid-cols-2">
            <div><p class="mb-3 text-sm font-medium text-muted-foreground">Mutual funds vs stocks</p><ChartDonut :slices="typeSlices" :currency="cur" center-label="Invested" /></div>
            <div><p class="mb-3 text-sm font-medium text-muted-foreground">By goal / bucket</p><ChartDonut :slices="bucketSlices" :currency="cur" center-label="Routed" /></div>
          </div>
          <div><p class="mb-3 text-sm font-medium text-muted-foreground">Invested each month</p><ChartBar :data="investedPerMonthData" :series="investedPerMonthSeries" stacked :currency="cur" :format-axis="compact" /></div>
          <div><p class="mb-1 text-sm font-medium text-muted-foreground">Investing rate</p><p class="mb-3 text-xs text-muted-foreground">Share of income invested, month by month — overall {{ Math.round(kpis.investedShareOfIncome * 100) }}%.</p><ChartLine :data="investRateData" :series="investRateSeries" pct /></div>
        </UiCardContent>
      </UiCard>

      <!-- Surplus allocation -->
      <UiCard v-if="allocSeries.length">
        <UiCardHeader><UiCardTitle class="text-base">Surplus allocation</UiCardTitle><UiCardDescription>How each month's surplus was split.</UiCardDescription></UiCardHeader>
        <UiCardContent><ChartBar :data="allocData" :series="allocSeries" stacked :currency="cur" :format-axis="compact" /></UiCardContent>
      </UiCard>
    </template>
  </div>
</template>
