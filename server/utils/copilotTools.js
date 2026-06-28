// AI copilot tool registry: the OpenAI Responses-API tool definitions
// (TOOL_DEFS) + the server-side executors (executeTool). Each executor reads the
// verified user's data via copilotData (Admin SDK) and the pure domain calc
// functions, formats every amount, and returns a compact, model-friendly object.
// READ-ONLY: no executor writes anything.
import { validateToolArgs } from '#domain/copilot/tools.js'
import {
  calc, makeFmt, monthsCurrency, serverCurrentMonth,
  loadSettings, loadMonth, loadMonthsList, loadExpenses, loadAccounts,
  loadInvestmentsRegistry, loadActivePlanVersion,
} from './copilotData.js'

const monthParam = { type: 'object', properties: { month: { type: 'string', description: 'Month key, YYYY-MM' } }, required: ['month'], additionalProperties: false }

// OpenAI Responses API function tools are FLAT: { type:'function', name, description, parameters }.
export const TOOL_DEFS = [
  { type: 'function', name: 'get_overview', description: 'High-level snapshot: default currency, current month, which months have data, and the latest month\'s income/expenses/surplus/savings rate. Call this first when you lack context.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { type: 'function', name: 'get_month_summary', description: 'Income, fixed/variable/total expenses, surplus and surplus routing for one month.', parameters: monthParam },
  { type: 'function', name: 'get_daily_spending', description: 'Daily budget vs actual spend for one month: budget, spent, remaining, per-day, over-budget, and spend grouped by date.', parameters: monthParam },
  { type: 'function', name: 'list_expenses', description: 'List individual daily expenses for one month, newest first; optionally filter by text in the item name.', parameters: { type: 'object', properties: { month: { type: 'string', description: 'YYYY-MM' }, query: { type: 'string', description: 'case-insensitive substring filter on the item name' }, limit: { type: 'integer', description: 'max rows (default 50, max 200)' } }, required: ['month'], additionalProperties: false } },
  { type: 'function', name: 'get_flow', description: 'Money-flow reconciliation for one month: how much transfers to each bank account and whether every source line is assigned.', parameters: monthParam },
  { type: 'function', name: 'get_investments', description: 'Investment breakdown for one month: mutual-fund and stock totals, per-fund amounts, and direct vs pooled routing.', parameters: monthParam },
  { type: 'function', name: 'get_analytics', description: 'Cross-month trends and KPIs: income/expenses/surplus/savings-rate per month, top expense categories, fixed vs variable, invested by type, and top daily-spend items. Defaults to the last 12 months (max 24).', parameters: { type: 'object', properties: { months: { type: 'integer', description: 'how many recent months to include (default 12, max 24)' } }, additionalProperties: false } },
  { type: 'function', name: 'get_plan', description: 'The user\'s active plan template (monthly or yearly): planned income, fixed/variable lines, and surplus routing — to compare intent vs a month\'s actuals.', parameters: { type: 'object', properties: { type: { type: 'string', enum: ['monthly', 'yearly'] } }, required: ['type'], additionalProperties: false } },
]

const pct = (x) => `${((Number(x) || 0) * 100).toFixed(1)}%`
// The user's free-text note for a month often explains WHY routing/spending choices
// were made — surface it (when non-empty) so the model can factor it into answers.
const noteField = (m) => (m?.notes && String(m.notes).trim() ? { notes: String(m.notes).trim() } : {})

/**
 * Validate + dispatch a single tool call. NEVER throws — on any failure returns
 * a small { error } object so the model can self-correct and the stream survives.
 * @param {string} uid verified user id (from the ID token, never the body)
 */
export async function executeTool(uid, name, args) {
  const v = validateToolArgs(name, args)
  if (!v.ok) return { error: `invalid_arguments: ${v.error}` }
  const a = v.data
  try {
    switch (name) {
      case 'get_overview': return await getOverview(uid)
      case 'get_month_summary': return await getMonthSummary(uid, a.month)
      case 'get_daily_spending': return await getDailySpending(uid, a.month)
      case 'list_expenses': return await listExpenses(uid, a.month, a.query, a.limit)
      case 'get_flow': return await getFlow(uid, a.month)
      case 'get_investments': return await getInvestments(uid, a.month)
      case 'get_analytics': return await getAnalytics(uid, a.months)
      case 'get_plan': return await getPlan(uid, a.type)
      default: return { error: 'unknown_tool' }
    }
  }
  catch (err) {
    console.error(`[copilot] tool ${name} failed:`, err)
    return { error: 'tool_failed', detail: String(err?.message || err).slice(0, 160) }
  }
}

// ── Executors ─────────────────────────────────────────────────────────────────
async function getOverview(uid) {
  const [settings, months] = await Promise.all([loadSettings(uid), loadMonthsList(uid)])
  const cur = monthsCurrency(months)
  const latest = months[0] || null
  let latestInfo = null
  if (latest) {
    const lf = makeFmt(latest.currency || settings.currency, settings.locale)
    const sp = calc.surplus(latest)
    latestInfo = {
      month: latest.month,
      currency: latest.currency || settings.currency,
      income: lf(latest.income ?? 0),
      expenses: lf(calc.totalExpenses(latest)),
      surplus: lf(sp),
      savingsRate: pct(latest.income ? sp / latest.income : 0),
    }
  }
  return {
    defaultCurrency: settings.currency,
    currentMonth: serverCurrentMonth(),
    hasData: months.length > 0,
    monthCount: months.length,
    monthsAvailable: months.slice(0, 24).map((m) => m.month),
    latest: latestInfo,
    ...(cur.mixed ? { mixedCurrency: true, currencies: cur.currencies, note: 'Months span multiple currencies; do not blend totals across them.' } : {}),
  }
}

async function getMonthSummary(uid, month) {
  const [settings, m] = await Promise.all([loadSettings(uid), loadMonth(uid, month)])
  if (!m) return { error: 'month_not_found', month }
  const c = m.currency || settings.currency
  const fmt = makeFmt(c, settings.locale)
  return {
    month, currency: c,
    ...noteField(m),
    income: fmt(m.income ?? 0),
    totalFixed: fmt(calc.totalFixed(m)),
    totalVariable: fmt(calc.totalVariable(m)),
    totalExpenses: fmt(calc.totalExpenses(m)),
    surplus: fmt(calc.surplus(m)),
    surplusPctAssigned: calc.surplusPctAssigned(m),
    surplusLines: calc.surplusAmounts(m).map((s) => ({ item: s.item, mode: s.mode, amount: fmt(s.amount) })),
  }
}

async function getDailySpending(uid, month) {
  const [settings, m] = await Promise.all([loadSettings(uid), loadMonth(uid, month)])
  if (!m) return { error: 'month_not_found', month }
  const c = m.currency || settings.currency
  const fmt = makeFmt(c, settings.locale)
  const dailies = await loadExpenses(uid, month, 2000)
  const sum = calc.dailySummary(m, dailies)
  const byDate = calc.groupByDate(dailies).slice(0, 14)
  return {
    month, currency: c,
    ...noteField(m),
    budget: fmt(sum.budget), spent: fmt(sum.spent), remaining: fmt(sum.remaining),
    overBudget: sum.remaining < 0,
    daysInMonth: sum.daysInMonth, perDayBudget: fmt(sum.perDay), expenseCount: sum.count,
    byDate: byDate.map((g) => ({ date: g.date, total: fmt(g.total), items: g.items.length })),
  }
}

async function listExpenses(uid, month, query, limit) {
  const [settings, m] = await Promise.all([loadSettings(uid), loadMonth(uid, month)])
  if (!m) return { error: 'month_not_found', month }
  const c = m.currency || settings.currency
  const fmt = makeFmt(c, settings.locale)
  const cap = Math.max(1, Math.min(200, Number(limit) || 50))
  let rows
  if (query) {
    const q = String(query).toLowerCase()
    rows = (await loadExpenses(uid, month, 2000)).filter((r) => (r.item || '').toLowerCase().includes(q)).slice(0, cap)
  }
  else {
    rows = await loadExpenses(uid, month, cap)
  }
  return {
    month, currency: c, count: rows.length,
    expenses: rows.map((r) => ({ date: r.date, item: r.item, amount: fmt(r.amount), ...(r.note ? { note: r.note } : {}) })),
  }
}

async function getFlow(uid, month) {
  const [settings, m, accounts] = await Promise.all([loadSettings(uid), loadMonth(uid, month), loadAccounts(uid)])
  if (!m) return { error: 'month_not_found', month }
  const c = m.currency || settings.currency
  const fmt = makeFmt(c, settings.locale)
  const byId = new Map(accounts.map((acc) => [acc.id, acc]))
  const rec = calc.reconcile(m)
  return {
    month, currency: c,
    ...noteField(m),
    balanced: rec.balanced,
    incomeAccount: byId.get(m.flow?.incomeAccountId)?.name || null,
    transfers: [...calc.accountTransfers(m).entries()].filter(([, amt]) => amt !== 0).map(([id, amt]) => ({ account: byId.get(id)?.name || 'Unknown account', amount: fmt(amt) })),
    unassignedLineCount: rec.unassignedIds.length,
    orphanReferenceCount: rec.orphanSourceIds.length,
    unassignedAmount: fmt(rec.diff),
  }
}

async function getInvestments(uid, month) {
  const [settings, m, registry] = await Promise.all([loadSettings(uid), loadMonth(uid, month), loadInvestmentsRegistry(uid)])
  if (!m) return { error: 'month_not_found', month }
  const c = m.currency || settings.currency
  const fmt = makeFmt(c, settings.locale)
  const b = calc.investmentBreakdown(m, registry)
  const invested = calc.investedTotal(m)
  const funds = (side) => side.holdings.filter((h) => h.amount > 0).map((h) => ({ name: h.name, amount: fmt(h.amount) }))
  const direct = (side) => side.direct.map((d) => ({ name: d.name, amount: fmt(d.amount), counted: fmt(d.investAmount), parked: fmt(d.parked) }))
  return {
    month, currency: c,
    ...noteField(m),
    investedTotal: fmt(invested.total),
    mutualFunds: { pooledTotal: fmt(b.mf.total), funds: funds(b.mf), direct: direct(b.mf) },
    stocks: { pooledTotal: fmt(b.stocks.total), holdings: funds(b.stocks), direct: direct(b.stocks) },
  }
}

async function getAnalytics(uid, monthsArg) {
  const [settings, all] = await Promise.all([loadSettings(uid), loadMonthsList(uid)])
  if (!all.length) return { hasData: false, note: 'No months yet — nothing to analyze.' }
  const n = Math.max(1, Math.min(24, Number(monthsArg) || 12))
  const selected = all.slice(0, n) // newest-first; calc functions sort internally
  const cur = monthsCurrency(selected)

  if (cur.mixed) {
    // B4: never present a blended cross-currency total — group per currency.
    const groups = {}
    for (const m of selected) (groups[m.currency || settings.currency] ||= []).push(m)
    const perCurrency = Object.entries(groups).map(([code, ms]) => {
      const fmt = makeFmt(code, settings.locale)
      const k = calc.analyticsKpis(calc.monthlySeries(ms)) || {}
      return {
        currency: code,
        months: ms.map((x) => x.month),
        totalIncome: fmt(k.totalIncome || 0),
        totalExpenses: fmt(k.totalExpenses || 0),
        totalSurplus: fmt(k.totalSurplus || 0),
        totalInvested: fmt(k.totalInvested || 0),
      }
    })
    return { mixedCurrency: true, currencies: cur.currencies, note: 'Months span multiple currencies; figures are grouped per currency and NOT blended.', perCurrency }
  }

  const c = cur.currency || settings.currency
  const fmt = makeFmt(c, settings.locale)
  const dailyByMonth = {}
  await Promise.all(selected.map(async (m) => {
    try { dailyByMonth[m.month] = await loadExpenses(uid, m.month, 2000) }
    catch { dailyByMonth[m.month] = [] }
  }))
  const series = calc.monthlySeries(selected)
  const kpis = calc.analyticsKpis(series)
  const cats = calc.expenseCategories(selected, 10, { excludeDailyBudget: true })
  const fxv = calc.fixedVsVariable(selected)
  const byType = calc.investedByType(selected)
  const da = calc.dailyAnalysis(dailyByMonth)
  return {
    currency: c,
    monthsIncluded: series.length,
    range: { from: series[0]?.month, to: series[series.length - 1]?.month },
    kpis: kpis ? {
      avgIncome: fmt(kpis.avgIncome), avgExpenses: fmt(kpis.avgExpenses), avgSurplus: fmt(kpis.avgSurplus),
      totalIncome: fmt(kpis.totalIncome), totalExpenses: fmt(kpis.totalExpenses), totalSurplus: fmt(kpis.totalSurplus),
      totalInvested: fmt(kpis.totalInvested), overallSavingsRate: pct(kpis.overallSavingsRate),
      bestMonth: kpis.best?.month, worstMonth: kpis.worst?.month,
    } : null,
    perMonth: series.map((s) => ({ month: s.month, income: fmt(s.income), expenses: fmt(s.expenses), surplus: fmt(s.surplus), invested: fmt(s.invested), savingsRate: pct(s.savingsRate) })),
    topExpenseCategories: cats.map((x) => ({ item: x.item, total: fmt(x.total) })),
    fixedVsVariable: { fixed: fmt(fxv.fixed), variable: fmt(fxv.variable) },
    investedByType: { mutualFunds: fmt(byType.mf), stocks: fmt(byType.stocks) },
    topDailyItems: da.items.slice(0, 10).map((x) => ({ item: x.item, total: fmt(x.total), count: x.count })),
  }
}

async function getPlan(uid, type) {
  const [settings, v] = await Promise.all([loadSettings(uid), loadActivePlanVersion(uid, type)])
  if (!v) return { type, exists: false, note: `No active ${type} plan yet.` }
  const c = v.currency || settings.currency
  const fmt = makeFmt(c, settings.locale)
  if (type === 'yearly') {
    return {
      type, currency: c, exists: true, label: v.label || undefined,
      fixedExpenses: (v.fixedExpenses || []).map((l) => ({ item: l.item, amount: fmt(l.amount), recurMonth: l.recurMonth })),
      variableExpenses: (v.variableExpenses || []).map((l) => ({ item: l.item, amount: fmt(l.amount), recurMonth: l.recurMonth })),
    }
  }
  return {
    type, currency: c, exists: true, label: v.label || undefined,
    income: fmt(v.income ?? 0),
    fixedExpenses: (v.fixedExpenses || []).map((l) => ({ item: l.item, amount: fmt(l.amount) })),
    variableExpenses: (v.variableExpenses || []).map((l) => ({ item: l.item, amount: fmt(l.amount), isDailyBudget: !!l.isDailyBudget })),
    surplus: (v.surplus || []).map((s) => ({ item: s.item, mode: s.mode, value: s.value, target: s.target || 'bank', direct: !!s.targetFundId })),
  }
}
