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

  // Checklist = manual to-dos + freshly generated auto-transfer to-dos (auto
  // to-dos are regenerated from the seed's flow, never copied, to avoid duplicates
  // and keep them in sync with the actual allocations).
  const manualTodos = (monthlyVersion?.todos ?? [])
    .filter((t) => !t.isAuto)
    .map((t) => ({ id: newId(), label: t.label, isDone: false, isAuto: false, order: t.order ?? 0 }))
  seed.checklist = buildChecklist(seed, cur, accountsById, manualTodos)

  return seed
}

/**
 * Build a month's checklist: the given MANUAL to-dos (already shaped as
 * {id,label,isDone,isAuto:false,order}) followed by freshly generated auto
 * transfer + investment to-dos, regenerated from the seed's own flow/pools so
 * they stay in sync, then re-indexed by order. Shared by buildMonthSeed and
 * buildMonthCopy so both produce identical checklists.
 * @param {object} seed a month seed (carries flow + surplus + investments)
 * @param {string} currency ISO 4217 code (for the formatted amounts)
 * @param {Map|Object} [accountsById] account-name lookup for transfer labels
 * @param {Array} manualTodos manual to-dos in the uniform line shape
 * @returns {Array} the ordered checklist
 */
export function buildChecklist(seed, currency, accountsById, manualTodos) {
  const autoTodos = autoTransferTodos(seed, currency, accountsById).map((t) => ({
    id: t.id, label: t.label, isDone: false, isAuto: true, accountId: t.accountId ?? null, order: 0,
  }))
  const invTodos = autoInvestmentTodos(seed, currency).map((t) => ({
    id: t.id, label: t.label, isDone: false, isAuto: true, accountId: t.accountId ?? null, order: 0,
  }))
  return [...(manualTodos ?? []), ...autoTodos, ...invTodos].map((t, i) => ({ ...t, order: i }))
}

/**
 * Duplicate an existing materialized Month into a fresh seed for another month —
 * the "Copy another month" path (§7). Copies the SETUP (income, expense lines +
 * amounts, money flow + bank routing, investment routing + frozen holdings,
 * manual checklist items) and RESETS progress (checklist done-states, notes, and
 * — handled by the caller — the daily-expenses subcollection are NOT carried).
 *
 * Mirrors buildMonthSeed's invariants: fresh UUIDs on every line (remapped through
 * one idMap), flow sourceIds remapped old→new (unresolved refs dropped), routing
 * deep-cloned with fresh ids, targetFundId/holdings preserved verbatim (they are
 * HOLDING ids, never line ids). Yearly-due one-offs (source 'YEARLY') are dropped
 * — they belong only to the month they're due in, re-added by Generate/Re-sync.
 *
 * @param {object} sourceMonth the month doc being copied
 * @param {string} targetMonthId "YYYY-MM" of the new month
 * @param {string} [currency] ISO code to stamp (defaults to the source's)
 * @param {Map|Object} [accountsById] account-name lookup for auto to-do labels
 * @param {Array} [registry] live holdings registry — used only to freeze a snapshot
 *   when copying a legacy source that never froze one
 * @returns {object} Month seed (sans createdAt/updatedAt — the repo stamps those)
 */
export function buildMonthCopy(sourceMonth, targetMonthId, currency, accountsById, registry) {
  const cur = currency ?? sourceMonth?.currency
  const idMap = new Map()
  const remap = (oldId) => {
    const nid = newId()
    if (oldId != null) idMap.set(oldId, nid)
    return nid
  }

  // Keep MONTHLY/MANUAL lines verbatim (only id + order change); drop YEARLY-due
  // one-offs. Spread is a sufficient clone — lines are flat (all-primitive fields),
  // so the copy shares no references with the source.
  const notYearly = (l) => l.source !== 'YEARLY'
  const fixedExpenses = (sourceMonth?.fixedExpenses ?? []).filter(notYearly).map((l, i) => ({ ...l, id: remap(l.id), order: i }))
  const variableExpenses = (sourceMonth?.variableExpenses ?? []).filter(notYearly).map((l, i) => ({ ...l, id: remap(l.id), order: i }))
  const surplus = (sourceMonth?.surplus ?? []).filter(notYearly).map((l, i) => ({ ...l, id: remap(l.id), order: i }))

  // Remap flow source refs old→new; refs to dropped/missing lines fall out.
  const allocations = (sourceMonth?.flow?.allocations ?? []).map((a) => ({
    accountId: a.accountId,
    sourceIds: (a.sourceIds ?? []).map((sid) => idMap.get(sid)).filter(Boolean),
  }))
  const flow = { incomeAccountId: sourceMonth?.flow?.incomeAccountId ?? null, allocations }

  // Deep-clone the routing tree with fresh ids (kind/funds/fundId survive).
  const snapRouting = (rows) => (rows ?? []).map((r, i) => ({ ...JSON.parse(JSON.stringify(r)), id: newId(), order: i }))
  const srcInv = sourceMonth?.investments ?? {}
  // Holdings: copy the source's frozen snapshot verbatim (keeps routing internally
  // consistent). Only a legacy source that never froze one falls back to freezing
  // from the live registry — mirrors investmentBreakdown's own fallback.
  const holdings = srcInv.holdingsFrozen || srcInv.holdings?.length
    ? (srcInv.holdings ?? []).map((h) => ({ ...h }))
    : (registry ?? []).filter((h) => !h.archived).map((h) => ({ id: h.id, kind: h.kind, name: h.name ?? '', bucket: h.bucket ?? '', active: h.active !== false }))
  const investments = {
    mf: snapRouting(srcInv.mf),
    stocks: snapRouting(srcInv.stocks),
    holdings,
    holdingsFrozen: true,
  }

  const seed = {
    month: targetMonthId,
    currency: cur,
    seededFrom: null, // a copy is not plan-seeded; the badge keys off copiedFrom
    copiedFrom: sourceMonth?.month ?? null,
    income: sourceMonth?.income ?? 0,
    fixedExpenses,
    variableExpenses,
    surplus,
    flow,
    investments,
    notes: '', // month-specific; reset like a fresh month
    checklist: [],
  }

  const manualTodos = (sourceMonth?.checklist ?? [])
    .filter((c) => !c.isAuto)
    .map((t, i) => ({ id: newId(), label: t.label, isDone: false, isAuto: false, order: t.order ?? i }))
  seed.checklist = buildChecklist(seed, cur, accountsById, manualTodos)

  return seed
}
