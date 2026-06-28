// Materialize a Month seed from the active plan versions (§5).
// Stamps currency, assigns fresh UUIDs to every copied line, remaps the flow's
// source references old→new so renames/edits never break routing, and merges in
// the yearly recurring items due that month.

import { newId } from '../ids.js'
import { autoTransferTodos } from './flow.js'
import { autoInvestmentTodos } from './investments.js'

/** Month number (1–12) from a "YYYY-MM" id. @param {string} monthId */
export function monthNumber(monthId) {
  return Number(String(monthId || '').slice(5, 7))
}

/**
 * Yearly recurring rows due in the given month, as fresh month line items.
 * @param {object} yearlyBody
 * @param {string} monthId "YYYY-MM"
 * @returns {{fixedExpenses:object[], variableExpenses:object[]}}
 */
export function yearlyItemsDueIn(yearlyBody, monthId) {
  const m = monthNumber(monthId)
  const pickFixed = (yearlyBody?.fixedExpenses ?? [])
    .filter((r) => r.recurMonth === m)
    .map((r, i) => ({ id: newId(), item: r.item, amount: r.amount, order: r.order ?? i, source: 'YEARLY' }))
  const pickVariable = (yearlyBody?.variableExpenses ?? [])
    .filter((r) => r.recurMonth === m)
    .map((r, i) => ({ id: newId(), item: r.item, amount: r.amount, isDailyBudget: false, order: r.order ?? i, source: 'YEARLY' }))
  return { fixedExpenses: pickFixed, variableExpenses: pickVariable }
}

/**
 * Merge the active monthly + yearly plan versions into an editable Month seed.
 * @param {object} monthlyVersion full monthly plan version (with id, body fields)
 * @param {object|null} yearlyVersion full yearly plan version, or null
 * @param {string} monthId "YYYY-MM"
 * @param {string} currency ISO 4217 code stamped on the seed
 * @param {Map|Object} [accountsById] optional account-name lookup for auto to-do labels
 * @returns {object} Month seed (sans createdAt/updatedAt — the repo stamps those)
 */
export function buildMonthSeed(monthlyVersion, yearlyVersion, monthId, currency, accountsById, investmentPlan, investments) {
  const cur = currency ?? monthlyVersion?.currency ?? yearlyVersion?.currency
  // Freeze the holdings this month distributes over (non-archived only, NO
  // `archived` field) so archiving/editing a fund later never changes this split.
  const snapHoldings = (investments ?? [])
    .filter((h) => !h.archived)
    .map((h) => ({ id: h.id, kind: h.kind, name: h.name ?? '', bucket: h.bucket ?? '', active: h.active !== false }))
  const idMap = new Map()
  const remap = (oldId) => {
    const nid = newId()
    if (oldId != null) idMap.set(oldId, nid)
    return nid
  }

  const fixedFromMonthly = (monthlyVersion?.fixedExpenses ?? []).map((l, i) => ({
    id: remap(l.id), item: l.item, amount: l.amount, order: l.order ?? i, source: 'MONTHLY',
  }))
  const variableFromMonthly = (monthlyVersion?.variableExpenses ?? []).map((l, i) => ({
    id: remap(l.id), item: l.item, amount: l.amount, isDailyBudget: !!l.isDailyBudget, order: l.order ?? i, source: 'MONTHLY',
  }))
  const surplusFromMonthly = (monthlyVersion?.surplus ?? []).map((l, i) => ({
    // targetFundId is a HOLDING id (preserved verbatim in the frozen snapshot) — it
    // must NOT be remapped through idMap (that only remaps line ids).
    id: remap(l.id), item: l.item, mode: l.mode, value: l.value, target: l.target ?? null,
    targetFundId: l.targetFundId ?? null, countAsInvestment: l.countAsInvestment ?? true,
    order: l.order ?? i, source: 'MONTHLY',
  }))

  // Snapshot the reusable investment routing plan into the month (deep copy so
  // the full allocation tree — kind/funds/fundId — survives; fresh id + order).
  const snapRouting = (rows) => (rows ?? []).map((r, i) => ({ ...JSON.parse(JSON.stringify(r)), id: newId(), order: i }))

  const due = yearlyItemsDueIn(yearlyVersion, monthId)

  // Remap flow source references old→new; drop ids that no longer resolve.
  const allocations = (monthlyVersion?.flow?.allocations ?? []).map((a) => ({
    accountId: a.accountId,
    sourceIds: (a.sourceIds ?? []).map((sid) => idMap.get(sid)).filter(Boolean),
  }))
  const flow = { incomeAccountId: monthlyVersion?.flow?.incomeAccountId ?? null, allocations }

  const seed = {
    month: monthId,
    currency: cur,
    seededFrom: {
      monthlyVersionId: monthlyVersion?.id ?? null,
      yearlyVersionId: yearlyVersion?.id ?? null,
    },
    income: monthlyVersion?.income ?? 0,
    fixedExpenses: [...fixedFromMonthly, ...due.fixedExpenses],
    variableExpenses: [...variableFromMonthly, ...due.variableExpenses],
    surplus: surplusFromMonthly,
    flow,
    investments: { mf: snapRouting(investmentPlan?.mfRouting), stocks: snapRouting(investmentPlan?.stockRouting), holdings: snapHoldings, holdingsFrozen: true },
    checklist: [],
  }

  // Checklist = manual plan to-dos + freshly generated auto-transfer to-dos
  // (auto to-dos are regenerated from the seed's flow, never copied, to avoid
  // duplicates and keep them in sync with the actual allocations).
  const manualTodos = (monthlyVersion?.todos ?? [])
    .filter((t) => !t.isAuto)
    .map((t) => ({ id: newId(), label: t.label, isDone: false, isAuto: false, order: t.order ?? 0 }))
  const autoTodos = autoTransferTodos(seed, cur, accountsById).map((t) => ({
    id: t.id, label: t.label, isDone: false, isAuto: true, accountId: t.accountId ?? null, order: 0,
  }))
  const invTodos = autoInvestmentTodos(seed, cur).map((t) => ({
    id: t.id, label: t.label, isDone: false, isAuto: true, accountId: t.accountId ?? null, order: 0,
  }))
  seed.checklist = [...manualTodos, ...autoTodos, ...invTodos].map((t, i) => ({ ...t, order: i }))

  return seed
}
