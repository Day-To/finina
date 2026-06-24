// ONE-TIME historical import (Feb–Jun 2026) from the source spreadsheet.
// Runs in the authenticated session via the normal repositories, so it writes to
// the signed-in user's data. Idempotent: accounts/funds are matched by name,
// months are upserted by id, and each month's daily expenses are replaced.
// SAFE TO DELETE after running: this file, app/data/history2026.json, and the
// "Load 2026 data" card in pages/settings.vue.
import { ref } from 'vue'
import HISTORY from '@/data/history2026.json'
import { bankAccountsRepo } from '~/repositories/bankAccounts.js'
import { investmentsRepo } from '~/repositories/investments.js'
import { investmentPlanRepo } from '~/repositories/investmentPlan.js'
import { monthsRepo } from '~/repositories/months.js'
import { dailyExpensesRepo } from '~/repositories/dailyExpenses.js'
import { newId } from '~/domain/ids.js'

const MINOR = 100 // INR
const minor = (rupees) => Math.round((Number(rupees) || 0) * MINOR)
const CUR = HISTORY.currency

export function useHistoryImport() {
  const auth = useAuthStore()
  const uid = () => {
    const u = auth.user?.uid
    if (!u) throw new Error('Not signed in')
    return u
  }
  const running = ref(false)
  const status = ref('')
  const dailyStatus = ref('')

  // Match by case-insensitive name; create only if missing → idempotent.
  async function ensureAccounts() {
    const existing = await bankAccountsRepo.list(uid())
    const byName = new Map(existing.map((a) => [a.name.trim().toLowerCase(), a]))
    const map = {}
    for (const name of HISTORY.accounts) {
      let acc = byName.get(name.toLowerCase())
      if (!acc) acc = await bankAccountsRepo.create(uid(), { name, bankName: name })
      map[name] = acc.id
    }
    return map
  }

  async function ensureInvestments() {
    const existing = await investmentsRepo.list(uid())
    const byName = new Map(existing.map((i) => [i.name.trim().toLowerCase(), i]))
    const map = {}
    for (const f of HISTORY.funds) {
      let inv = byName.get(f.name.toLowerCase())
      if (!inv) inv = await investmentsRepo.create(uid(), { kind: 'mutualFund', name: f.name, bucket: f.bucket || '', category: f.category || '', subCategory: f.subCategory || '', active: f.distribution !== 'PAUSED' })
      map[f.name] = inv
    }
    for (const s of HISTORY.stocks) {
      let inv = byName.get(s.name.toLowerCase())
      if (!inv) inv = await investmentsRepo.create(uid(), { kind: 'stock', name: s.name, bucket: '', category: s.category || '', platform: s.platform || '', active: s.distribution !== 'PAUSED' })
      map[s.name] = inv
    }
    return map
  }

  // Per-fund routing that reproduces the sheet's split: FIXED → AMOUNT (minor),
  // VARIABLE → PCT (taken after fixed, of the remaining pool — exactly how the
  // calc + the spreadsheet compute it). Fresh ids each call (per-month snapshot).
  function buildRouting(invMap) {
    const mfRouting = HISTORY.funds.filter((f) => f.distribution !== 'PAUSED').map((f, i) => (
      f.distribution === 'FIXED'
        ? { id: newId(), kind: 'fund', fundId: invMap[f.name].id, mode: 'AMOUNT', value: minor(f.value), order: i }
        : { id: newId(), kind: 'fund', fundId: invMap[f.name].id, mode: 'PCT', value: f.value, order: i }
    ))
    const stockRouting = HISTORY.stocks.filter((s) => s.distribution !== 'PAUSED').map((s, i) => (
      { id: newId(), kind: 'fund', fundId: invMap[s.name].id, mode: 'PCT', value: s.value, order: i }
    ))
    return { mfRouting, stockRouting }
  }

  function holdingsSnapshot(invMap) {
    const rows = []
    for (const f of HISTORY.funds) rows.push({ id: invMap[f.name].id, kind: 'mutualFund', name: f.name, bucket: f.bucket || '', active: f.distribution !== 'PAUSED' })
    for (const s of HISTORY.stocks) rows.push({ id: invMap[s.name].id, kind: 'stock', name: s.name, bucket: '', active: s.distribution !== 'PAUSED' })
    return rows
  }

  function buildMonth(mid, m, accMap, invMap) {
    const fixedExpenses = m.fixed.map(([item, amt], i) => ({ id: newId(), item, amount: minor(amt), order: i, source: 'MONTHLY' }))
    const variableExpenses = m.variable.map(([item, amt, isDaily], i) => ({ id: newId(), item, amount: minor(amt), isDailyBudget: !!isDaily, order: i, source: 'MONTHLY' }))
    const surplus = m.surplus.map(([item, pct, target], i) => ({ id: newId(), item, mode: 'PCT', value: Number(pct) || 0, target: target ?? null, order: i, source: 'MONTHLY' }))

    // Flow (income lands in SBI; transfers to the others). Investment money flows
    // through a bank account too: MF → SBI, Stocks → AXIS (as in the spreadsheet).
    const sId = (n) => accMap[n]
    const byItem = (arr, names) => arr.filter((l) => names.includes(l.item)).map((l) => l.id)
    const notItem = (arr, names) => arr.filter((l) => !names.includes(l.item)).map((l) => l.id)
    const allocations = [
      { accountId: sId('PNB'), sourceIds: variableExpenses.map((l) => l.id) },
      { accountId: sId('SBI'), sourceIds: [...notItem(fixedExpenses, ['Bajaj EMI']), ...byItem(surplus, ['Loan Repayment Extra', 'Mutual Funds'])] },
      { accountId: sId('Axis Bank'), sourceIds: [...byItem(fixedExpenses, ['Bajaj EMI']), ...byItem(surplus, ['Travel / Fun', 'Buffer / Flex', 'Stocks'])] },
      { accountId: sId('Kotak Mahindra Bank'), sourceIds: byItem(surplus, ['Emergency Fund']) },
    ].filter((a) => a.sourceIds.length)
    const flow = { incomeAccountId: sId('SBI'), allocations }

    const routing = buildRouting(invMap)
    const investments = { mf: routing.mfRouting, stocks: routing.stockRouting, holdings: holdingsSnapshot(invMap), holdingsFrozen: true }

    // Checklist: transfer reminders for the non-income accounts + investment +
    // a manual item, all marked done (the sheet had them all ticked). The app
    // re-derives labels on load but preserves done-state by accountId.
    const hasMf = surplus.some((s) => s.target === 'MUTUAL_FUNDS' && s.value > 0)
    const hasStk = surplus.some((s) => s.target === 'STOCKS' && s.value > 0)
    const checklist = [
      { id: newId(), label: 'Transfer to PNB', isDone: true, isAuto: true, accountId: sId('PNB'), order: 0 },
      { id: newId(), label: 'Transfer to Axis', isDone: true, isAuto: true, accountId: sId('Axis Bank'), order: 1 },
      { id: newId(), label: 'Transfer to Kotak', isDone: true, isAuto: true, accountId: sId('Kotak Mahindra Bank'), order: 2 },
      ...(hasMf ? [{ id: newId(), label: 'Make Mutual Funds investment', isDone: true, isAuto: true, accountId: 'inv:mf', order: 3 }] : []),
      ...(hasStk ? [{ id: newId(), label: 'Make Stocks investment', isDone: true, isAuto: true, accountId: 'inv:stocks', order: 4 }] : []),
      { id: newId(), label: 'Pay for FIXED EXPENSES items if any', isDone: true, isAuto: false, order: 5 },
    ]

    return { month: mid, currency: CUR, seededFrom: null, income: minor(m.income), fixedExpenses, variableExpenses, surplus, flow, investments, checklist }
  }

  async function importDaily(mid, dailies) {
    const existing = await dailyExpensesRepo.list(uid(), mid)
    for (const e of existing) await dailyExpensesRepo.remove(uid(), mid, e.id)
    for (const [date, item, amount, note] of dailies) {
      await dailyExpensesRepo.add(uid(), mid, { date: date || `${mid}-01`, item, amount: minor(amount), note: note || '' }, CUR)
    }
  }

  async function run() {
    if (running.value) return
    running.value = true
    try {
      status.value = 'Bank accounts…'
      const accMap = await ensureAccounts()
      status.value = 'Funds & stocks…'
      const invMap = await ensureInvestments()
      status.value = 'Investment routing…'
      const r = buildRouting(invMap)
      await investmentPlanRepo.saveRouting(uid(), { mfRouting: r.mfRouting, stockRouting: r.stockRouting, label: 'Imported from spreadsheet' })
      const ids = Object.keys(HISTORY.months).sort()
      for (const mid of ids) {
        status.value = `Month ${mid}…`
        await monthsRepo.upsert(uid(), mid, buildMonth(mid, HISTORY.months[mid], accMap, invMap))
        await importDaily(mid, HISTORY.months[mid].daily)
      }
      status.value = `Imported ${ids.length} months (${ids[0]} – ${ids[ids.length - 1]}).`
      return { months: ids.length }
    }
    finally {
      running.value = false
    }
  }

  // Daily-only import: load each available month's daily-expense log from the
  // spreadsheet and NOTHING else (no income/expenses/surplus/investments/checklist).
  // Skips any month that already has daily expenses, so it never duplicates rows.
  async function runDailyOnly() {
    if (running.value) return
    running.value = true
    try {
      const ids = Object.keys(HISTORY.months).sort()
      let imported = 0
      let skipped = 0
      let added = 0
      for (const mid of ids) {
        const dailies = HISTORY.months[mid].daily || []
        if (!dailies.length) continue
        const existing = await dailyExpensesRepo.list(uid(), mid)
        if (existing.length) {
          skipped++
          dailyStatus.value = `Skipped ${mid} — already has ${existing.length} daily expense(s).`
          continue
        }
        dailyStatus.value = `Loading ${dailies.length} daily expenses for ${mid}…`
        // Stamp with the month's own currency when the month exists; else the sheet's.
        const month = await monthsRepo.get(uid(), mid)
        const cur = month?.currency || CUR
        for (const [date, item, amount, note] of dailies) {
          await dailyExpensesRepo.add(uid(), mid, { date: date || `${mid}-01`, item, amount: minor(amount), note: note || '' }, cur)
          added++
        }
        imported++
      }
      dailyStatus.value = `Done — loaded ${added} daily expenses across ${imported} month(s); skipped ${skipped} already loaded.`
      return { imported, skipped, added }
    }
    finally {
      running.value = false
    }
  }

  return { run, runDailyOnly, running, status, dailyStatus, monthCount: Object.keys(HISTORY.months).length }
}
