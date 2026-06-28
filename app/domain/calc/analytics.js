// Cross-month analytics & insights (pure, integer minor units). Aggregates a set
// of month docs (+ their daily expenses) into the series the Insights screen
// charts. No Vue, no Firebase. Assumes a consistent currency across months (v1).

import { totalExpenses, surplus, surplusAmounts } from './totals.js'
import { investedTotal, investmentBreakdown } from './investments.js'

const byMonthAsc = (a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0)
const sumBy = (arr, f) => (arr ?? []).reduce((s, x) => s + (f(x) || 0), 0)

/**
 * Per-month headline figures, chronological.
 * @param {object[]} months
 * @returns {Array<{month,income,expenses,fixed,variable,surplus,savingsRate,mf,stocks,invested}>}
 */
export function monthlySeries(months) {
  return [...(months ?? [])].sort(byMonthAsc).map((m) => {
    const income = m.income ?? 0
    const fixed = sumBy(m.fixedExpenses, (l) => l.amount)
    const variable = sumBy(m.variableExpenses, (l) => l.amount)
    const sp = surplus(m)
    const it = investedTotal(m)
    const invested = it.total
    return {
      month: m.month,
      income,
      expenses: totalExpenses(m),
      fixed,
      variable,
      surplus: sp,
      savingsRate: income > 0 ? sp / income : 0,
      mf: it.mf,
      stocks: it.stocks,
      invested,
      // Share of income routed to investments this month ("investing rate").
      investRate: income > 0 ? invested / income : 0,
    }
  })
}

/**
 * Aggregate fixed + variable expense LINES by item name across months.
 * @param {object[]} months
 * @param {number} [limit]
 * @param {{ excludeDailyBudget?: boolean }} [opts] When excludeDailyBudget is set,
 *   variable lines flagged isDailyBudget are skipped — they represent the daily
 *   spending pool (tracked separately) and otherwise dominate the ranking.
 */
export function expenseCategories(months, limit = Infinity, opts = {}) {
  const { excludeDailyBudget = false } = opts
  const map = new Map()
  const bump = (item, key, amt) => {
    const name = (item || 'Untitled').trim() || 'Untitled'
    const r = map.get(name) || { item: name, fixed: 0, variable: 0, total: 0 }
    r[key] += amt || 0
    r.total += amt || 0
    map.set(name, r)
  }
  for (const m of months ?? []) {
    for (const l of m.fixedExpenses ?? []) bump(l.item, 'fixed', l.amount)
    for (const l of m.variableExpenses ?? []) {
      if (excludeDailyBudget && l.isDailyBudget) continue
      bump(l.item, 'variable', l.amount)
    }
  }
  const rows = [...map.values()].sort((a, b) => b.total - a.total)
  return Number.isFinite(limit) ? rows.slice(0, limit) : rows
}

/** Fixed vs variable totals across all months. */
export function fixedVsVariable(months) {
  let fixed = 0
  let variable = 0
  for (const m of months ?? []) {
    fixed += sumBy(m.fixedExpenses, (l) => l.amount)
    variable += sumBy(m.variableExpenses, (l) => l.amount)
  }
  return { fixed, variable, total: fixed + variable }
}

/**
 * Where the surplus went, per month, grouped by surplus-line item name. Returns
 * the ordered item names (by all-time total) and a per-month value map for stacks.
 */
export function surplusAllocationSeries(months) {
  const sorted = [...(months ?? [])].sort(byMonthAsc)
  const totals = new Map()
  const series = sorted.map((m) => {
    const values = {}
    for (const s of surplusAmounts(m)) {
      const name = (s.item || 'Other').trim() || 'Other'
      values[name] = (values[name] || 0) + (s.amount || 0)
      totals.set(name, (totals.get(name) || 0) + (s.amount || 0))
    }
    return { month: m.month, values }
  })
  const items = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  return { items, series, totals: Object.fromEntries(totals) }
}

/** Per-month invested + running cumulative. */
export function investmentSeries(months) {
  let cumulative = 0
  return monthlySeries(months).map((s) => {
    cumulative += s.invested
    return { month: s.month, mf: s.mf, stocks: s.stocks, invested: s.invested, cumulative }
  })
}

/** Mutual-funds vs stocks invested across all months. */
export function investedByType(months) {
  let mf = 0
  let stocks = 0
  for (const s of monthlySeries(months)) { mf += s.mf; stocks += s.stocks }
  return { mf, stocks, total: mf + stocks }
}

/**
 * Cumulative invested grouped by bucket across months (resolved per-fund, so it
 * honors each month's frozen snapshot). Stocks (no bucket) fold into "Stocks".
 */
export function investedByBucket(months, registry) {
  const map = new Map()
  // The per-fund leaves don't carry `kind`, so tag it from which side they came.
  const addAmt = (bucket, kind, amt) => {
    if (!amt) return // skip zero (e.g. parked direct has investAmount 0) — no noise buckets
    const name = (bucket || '').trim() || (kind === 'stock' ? 'Stocks' : 'Unbucketed')
    map.set(name, (map.get(name) || 0) + amt)
  }
  for (const m of months ?? []) {
    const b = investmentBreakdown(m, registry)
    for (const h of b.mf.holdings) addAmt(h.bucket, 'mutualFund', h.amount)
    for (const h of b.stocks.holdings) addAmt(h.bucket, 'stock', h.amount)
    // Counted direct routings invest into their holding's bucket too.
    for (const d of b.mf.direct) addAmt(d.bucket, 'mutualFund', d.investAmount)
    for (const d of b.stocks.direct) addAmt(d.bucket, 'stock', d.investAmount)
  }
  return [...map.entries()].map(([bucket, amount]) => ({ bucket, amount })).sort((a, b) => b.amount - a.amount)
}

/**
 * Daily-expense analysis. dailyByMonth: { [monthId]: Array<{item,amount}> }.
 * Aggregates spend by item label (no category field in v1) + a per-month total.
 */
export function dailyAnalysis(dailyByMonth) {
  const byItem = new Map()
  const byMonth = {}
  let total = 0
  let count = 0
  for (const [mid, list] of Object.entries(dailyByMonth ?? {})) {
    let monthTotal = 0
    for (const e of list ?? []) {
      const name = (e.item || 'Misc').trim() || 'Misc'
      const r = byItem.get(name) || { item: name, total: 0, count: 0 }
      r.total += e.amount || 0
      r.count += 1
      byItem.set(name, r)
      monthTotal += e.amount || 0
      total += e.amount || 0
      count += 1
    }
    byMonth[mid] = monthTotal
  }
  return { items: [...byItem.values()].sort((a, b) => b.total - a.total), byMonth, total, count }
}

/** Headline KPIs over the monthly series. */
export function analyticsKpis(series) {
  const n = (series ?? []).length
  if (!n) return null
  const sum = (k) => series.reduce((s, x) => s + x[k], 0)
  const best = series.reduce((a, b) => (b.surplus > a.surplus ? b : a))
  const worst = series.reduce((a, b) => (b.surplus < a.surplus ? b : a))
  const first = series[0]
  const last = series[n - 1]
  return {
    months: n,
    avgIncome: sum('income') / n,
    avgExpenses: sum('expenses') / n,
    avgSurplus: sum('surplus') / n,
    totalSurplus: sum('surplus'),
    totalInvested: sum('invested'),
    totalIncome: sum('income'),
    totalExpenses: sum('expenses'),
    avgSavingsRate: sum('savingsRate') / n,
    overallSavingsRate: sum('income') > 0 ? sum('surplus') / sum('income') : 0,
    investedShareOfIncome: sum('income') > 0 ? sum('invested') / sum('income') : 0,
    first,
    last,
    best,
    worst,
    savingsRateDelta: last.savingsRate - first.savingsRate,
  }
}
