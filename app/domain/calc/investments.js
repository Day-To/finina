// Investment routing (§ investments plan). Two-level distribution of a surplus
// pool: pool → bucket allocations (FIXED first, then PCT split the remainder) →
// holdings within a bucket split by weight. Pure JS, integer minor units, with
// rounding remainders reconciled to the largest row so totals stay exact.

import { surplusAmounts } from './totals.js'
import { newId } from '../ids.js'
import { formatMoney } from '../money.js'

/**
 * Sum surplus lines tagged with an investment target into { mf, stocks } pools.
 * @param {object} body a plan/month body (has surplus + income + expenses)
 * @returns {{ mf: number, stocks: number }} minor units
 */
export function investmentPools(body) {
  let mf = 0
  let stocks = 0
  for (const s of surplusAmounts(body)) {
    // Direct-to-holding routings are NOT pool money (they bypass the pool spread).
    if (s.targetFundId) continue
    if (s.target === 'MUTUAL_FUNDS') mf += s.amount
    else if (s.target === 'STOCKS') stocks += s.amount
  }
  return { mf, stocks }
}

/**
 * Surplus lines routed DIRECTLY to a specific holding (targetFundId set). Each is
 * 100% to that fund/stock, bypassing the pool spread. `counted` = whether it's an
 * investment (default true) vs "Parked" saving (false).
 * @param {object} body
 * @returns {Array<{id,item,fundId,kind:'mutualFund'|'stock',amount,counted}>}
 */
export function directRoutings(body) {
  const out = []
  for (const s of surplusAmounts(body)) {
    if (!s.target || !s.targetFundId || s.amount <= 0) continue
    out.push({
      id: s.id, item: s.item, fundId: s.targetFundId,
      kind: s.target === 'STOCKS' ? 'stock' : 'mutualFund',
      amount: s.amount, counted: s.countAsInvestment !== false,
    })
  }
  return out
}

/**
 * Total money classified as INVESTMENT this month = pool-routed (always counted) +
 * counted direct routings. Parked (countAsInvestment=false) direct money is excluded.
 * This is the analytics/KPI "invested" number (distinct from investmentPools, which
 * is pool-only and drives the per-type spread).
 * @param {object} body
 * @returns {{ mf:number, stocks:number, total:number }}
 */
export function investedTotal(body) {
  const pools = investmentPools(body)
  let { mf, stocks } = pools
  for (const d of directRoutings(body)) {
    if (!d.counted) continue
    if (d.kind === 'stock') stocks += d.amount
    else mf += d.amount
  }
  return { mf, stocks, total: mf + stocks }
}

/**
 * Level 1 — distribute a pool across allocation rows (bucket OR single fund).
 * AMOUNT (fixed) rows take their value first; PCT rows split the remaining
 * variable pool, normalized by the sum of PCT values. Underfunded (fixed > pool)
 * keeps fixed and gives PCT 0. Rounding drift goes to the largest PCT row.
 * @param {number} pool minor units
 * @param {Array<{id,kind,bucket,fundId,funds,mode,value}>} routing
 */
export function distributeAllocations(pool, routing) {
  const P = Math.max(0, Number(pool) || 0)
  const rows = (routing ?? []).map((r) => ({
    id: r.id, kind: r.kind ?? 'bucket', bucket: r.bucket ?? '',
    fundId: r.fundId ?? null, funds: r.funds ?? [],
    mode: r.mode, value: Number(r.value) || 0, amount: 0,
  }))
  const fixedTotal = rows.filter((r) => r.mode === 'AMOUNT').reduce((s, r) => s + Math.round(r.value), 0)
  const pctSum = rows.filter((r) => r.mode === 'PCT').reduce((s, r) => s + r.value, 0)
  const variablePool = Math.max(0, P - fixedTotal)
  for (const r of rows) {
    r.amount = r.mode === 'AMOUNT' ? Math.round(r.value) : pctSum > 0 ? Math.round((variablePool * r.value) / pctSum) : 0
  }
  // Reconcile PCT rounding drift against the variable pool (largest PCT row).
  const pctRows = rows.filter((r) => r.mode === 'PCT')
  const drift = (pctSum > 0 ? variablePool : 0) - pctRows.reduce((s, r) => s + r.amount, 0)
  if (drift !== 0 && pctRows.length) pctRows.reduce((a, b) => (b.amount > a.amount ? b : a)).amount += drift
  return { rows, fixedTotal, variablePool, pctSum, overFunded: fixedTotal > P }
}
// Contract name kept — the level-1 split is kind-agnostic.
export const distributeBuckets = distributeAllocations

/**
 * Level 2 — resolve each allocation row to per-fund leaves.
 * - kind:'fund' → one leaf for that fund (the whole row amount). It is the sole
 *   payer for that fund: it is removed from any bucket's split (no double-pay).
 * - kind:'bucket' → split its amount across ACTIVE in-bucket funds (minus any
 *   solo-routed fund) by funds[].pct, normalized by their sum (all-0 ⇒ equal;
 *   a fund absent from funds[] ⇒ pct 0). Surfaces the EFFECTIVE normalized pct
 *   so the displayed % always matches the displayed amount.
 * @param {Array} rows resolved allocation rows (carry kind/fundId/funds/amount)
 * @param {Array} holdings the kind's registry holdings
 * @returns {Array<{id,name,bucket,fundId,pct,amount}>}
 */
export function distributeToHoldings(rows, holdings) {
  const out = []
  const active = (holdings ?? []).filter((h) => h.active !== false)
  const byId = new Map(active.map((h) => [h.id, h]))
  const soloFundIds = new Set((rows ?? []).filter((r) => r.kind === 'fund').map((r) => r.fundId))

  for (const r of rows ?? []) {
    if (r.kind === 'fund') {
      const h = byId.get(r.fundId)
      if (h) out.push({ id: h.id, name: h.name, bucket: h.bucket ?? '', fundId: h.id, allocId: r.id, pct: 100, amount: r.amount })
      continue
    }
    const inBucket = active.filter((h) => (h.bucket || '') === (r.bucket || '') && !soloFundIds.has(h.id))
    const pctById = new Map((r.funds ?? []).map((f) => [f.fundId, Number(f.pct) || 0]))
    const pctSum = inBucket.reduce((s, h) => s + Math.max(0, pctById.get(h.id) || 0), 0)
    let allocated = 0
    let slice
    if (pctSum > 0) {
      slice = inBucket.map((h) => {
        const p = Math.max(0, pctById.get(h.id) || 0)
        const amount = Math.round((r.amount * p) / pctSum)
        allocated += amount
        return { id: h.id, name: h.name, bucket: r.bucket, fundId: h.id, allocId: r.id, pct: Math.round((p / pctSum) * 100), amount }
      })
    }
    else {
      const n = inBucket.length
      slice = inBucket.map((h) => {
        const amount = n > 0 ? Math.round(r.amount / n) : 0
        allocated += amount
        return { id: h.id, name: h.name, bucket: r.bucket, fundId: h.id, allocId: r.id, pct: n ? Math.round(100 / n) : 0, amount }
      })
    }
    const drift = r.amount - allocated
    if (drift !== 0 && slice.length) slice.reduce((a, c) => (c.amount > a.amount ? c : a)).amount += drift
    out.push(...slice)
  }
  return out
}

/**
 * Full breakdown for one investment type at a given pool + routing + holdings.
 * stranded = bucket rows with no eligible active funds; unrouted = active
 * holdings reached by no bucket row and not solo-routed; invalidFundRows =
 * kind:'fund' rows whose fund is missing/paused (amount counted but not resolved).
 */
export function investmentTypeBreakdown(pool, routing, holdings, directFundIds = new Set()) {
  const dist = distributeAllocations(pool, routing)
  const active = (holdings ?? []).filter((h) => h.active !== false)
  const byId = new Map(active.map((h) => [h.id, h]))
  const soloFundIds = new Set(dist.rows.filter((r) => r.kind === 'fund').map((r) => r.fundId))
  const perFund = distributeToHoldings(dist.rows, holdings)

  const eligible = (b) => active.some((h) => (h.bucket || '') === (b || '') && !soloFundIds.has(h.id))
  const stranded = dist.rows.filter((r) => r.kind === 'bucket' && !eligible(r.bucket)).map((r) => r.bucket)
  const invalidFundRows = dist.rows.filter((r) => r.kind === 'fund' && !byId.has(r.fundId)).map((r) => ({ id: r.id, fundId: r.fundId, amount: r.amount }))
  const emitted = new Set(perFund.map((h) => h.id))
  // A fund that receives a DIRECT surplus routing isn't "unrouted" from the pool's
  // perspective — it just gets its money from a direct line, not the spread.
  const unrouted = active.filter((h) => !emitted.has(h.id) && !soloFundIds.has(h.id) && !directFundIds.has(h.id))

  const total = dist.rows.reduce((s, r) => s + r.amount, 0)
  const resolvedTotal = perFund.reduce((s, h) => s + h.amount, 0)
  return { pool, ...dist, holdings: perFund, total, resolvedTotal, stranded, unrouted, invalidFundRows }
}

/**
 * Month-level breakdown driving the month Investments block. Distributes over the
 * month's FROZEN holdings snapshot when present (so archiving/editing a fund later
 * never changes a past month); falls back to the live registry for legacy months.
 * @param {object} month the month doc (carries surplus + investments snapshot)
 * @param {Array} registry the global holdings registry (legacy fallback only)
 */
export function investmentBreakdown(month, registry) {
  const pools = investmentPools(month)
  const inv = month?.investments
  // A frozen month uses its snapshot verbatim (even when empty); only a legacy
  // month (no snapshot ever taken) falls back to the live registry.
  const src = inv?.holdingsFrozen ? (inv.holdings ?? []) : ((inv?.holdings?.length) ? inv.holdings : (registry ?? []))
  const directs = directRoutings(month)

  // The pool spread stays EXACTLY as before (pool/total/resolvedTotal/holdings/
  // stranded/unrouted/balanced inputs are pool-only). Direct routings are carried
  // as a SEPARATE structure so card invariants (total===pool===resolvedTotal) hold.
  const side = (kind, poolAmt, routing) => {
    const sideSrc = src.filter((h) => h.kind === kind)
    const sideDirect = directs.filter((d) => d.kind === kind)
    const directFundIds = new Set(sideDirect.map((d) => d.fundId))
    const base = investmentTypeBreakdown(poolAmt, routing ?? [], sideSrc, directFundIds)

    // Resolve direct lines against the side's ACTIVE holdings (mirror pool semantics:
    // paused/archived/missing → invalidDirect). Aggregate multiple lines per fund.
    const byId = new Map(sideSrc.filter((h) => h.active !== false).map((h) => [h.id, h]))
    const map = new Map()
    const invalidDirect = []
    for (const d of sideDirect) {
      const h = byId.get(d.fundId)
      if (!h) { invalidDirect.push({ id: d.id, fundId: d.fundId, amount: d.amount }); continue }
      const cur = map.get(d.fundId) ?? { fundId: d.fundId, name: h.name ?? '', bucket: h.bucket ?? '', amount: 0, investAmount: 0 }
      cur.amount += d.amount
      if (d.counted) cur.investAmount += d.amount
      map.set(d.fundId, cur)
    }
    const direct = [...map.values()].map((x) => ({ ...x, parked: x.amount - x.investAmount }))
    const directTotal = direct.reduce((s, x) => s + x.amount, 0)
    const directInvested = direct.reduce((s, x) => s + x.investAmount, 0)
    return { ...base, direct, directTotal, directInvested, invalidDirect }
  }

  return {
    mf: side('mutualFund', pools.mf, month?.investments?.mf),
    stocks: side('stock', pools.stocks, month?.investments?.stocks),
  }
}

/**
 * Auto checklist items for non-zero investment pools. Synthetic stable accountId
 * keys ('inv:mf' / 'inv:stocks') for done-state preservation across re-sync;
 * they never collide with UUID account ids (no ':' in crypto.randomUUID()).
 */
export function autoInvestmentTodos(body, currency) {
  const { mf, stocks } = investmentPools(body)
  const directs = directRoutings(body)
  // Action total = pool + ALL direct (counted AND parked) — you physically move
  // parked money to the fund too; the counted/parked split is analytics-only.
  const mfAction = mf + directs.filter((d) => d.kind === 'mutualFund').reduce((s, d) => s + d.amount, 0)
  const stAction = stocks + directs.filter((d) => d.kind === 'stock').reduce((s, d) => s + d.amount, 0)
  const todos = []
  if (mfAction > 0) todos.push({ id: newId(), label: `Move ${formatMoney(mfAction, currency)} to Mutual Funds`, isAuto: true, accountId: 'inv:mf', order: 0 })
  if (stAction > 0) todos.push({ id: newId(), label: `Move ${formatMoney(stAction, currency)} to Stocks`, isAuto: true, accountId: 'inv:stocks', order: 0 })
  return todos
}
