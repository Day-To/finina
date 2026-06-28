// Pure builder for the full end-to-end money map (rendered with Vue Flow). No
// Vue / Firebase import — testable in plain JS, mirroring useFlowGraph.js. Splices
// the two existing trees at the surplus join so EVERY item is a node:
//   Income → bank accounts → each expense/surplus line → investment pools →
//   buckets / direct funds → every individual fund & stock.
// Conservation: income → {accounts, unassigned, kept} sums to income; the
// investment chain is a continuation of the pool nodes (no double count).

import { surplusAmounts, sourceAmountMap, investmentPools, investmentBreakdown } from '../domain/calc/index.js'
import { flattenAssignment, deriveFlow, reconcileSummary } from './useFlowGraph.js'

// Semantic finance families (see CLAUDE.md "Color hierarchy"): transfer = blue
// (income + accounts), spend = red (expenses), saving = green, investment =
// emerald (mutual funds + stocks as two emerald shades). 'warn' is an
// out-of-family attention state (unassigned / unrouted).
const C = {
  income: 'var(--auto)', account: 'var(--transfer-2)', transfer: 'var(--transfer-2)',
  expense: 'var(--negative)', save: 'var(--positive)',
  mf: 'var(--invest)', stocks: 'var(--invest-2)',
  idle: 'var(--muted-foreground)', warn: '#f43f5e',
}
// Left→right columns.
const X = { income: 0, account: 320, item: 690, pool: 1080, bucket: 1430, fund: 1780 }
const NODE_H = 66
const ROW = 96 // vertical slot per leaf (node + gap)

/**
 * @returns {{ nodes: object[], edges: object[], reconcile: {balanced:boolean, summary:string}, counts: object }}
 */
export function buildMoneyGraph({ month, accounts = [], accountsById = null, registry = [], currency, archivedFundIds = new Set(), pausedFundIds = new Set() } = {}) {
  const empty = { nodes: [], edges: [], reconcile: { balanced: true, summary: '' }, counts: { accounts: 0, items: 0, funds: 0 } }
  if (!month) return empty
  const income = Math.max(0, month.income ?? 0)
  const nameOf = (id) => (accountsById?.get ? accountsById.get(id)?.name : accounts.find((a) => a.id === id)?.name) || 'Account'

  const fixedIds = new Set((month.fixedExpenses || []).map((l) => l.id))
  const varIds = new Set((month.variableExpenses || []).map((l) => l.id))
  const sAmts = surplusAmounts(month)
  const targetById = new Map(sAmts.map((s) => [s.id, s.target || null]))
  const amountOf = sourceAmountMap(month)
  const assignment = flattenAssignment(month.flow)
  const bd = investmentBreakdown(month, registry)

  // Every allocatable line as a graph item.
  const items = []
  for (const l of month.fixedExpenses || []) items.push({ id: l.id, label: l.item || 'Fixed', amount: amountOf.get(l.id) || 0, type: 'fixed' })
  for (const l of month.variableExpenses || []) items.push({ id: l.id, label: l.item || 'Variable', amount: amountOf.get(l.id) || 0, type: 'variable', daily: !!l.isDailyBudget })
  for (const s of sAmts) {
    const t = targetById.get(s.id)
    items.push({ id: s.id, label: s.item || 'Surplus', amount: s.amount, type: t === 'MUTUAL_FUNDS' ? 'mf' : t === 'STOCKS' ? 'stocks' : 'save' })
  }
  const d = deriveFlow(items, accounts, month.flow)

  const nodes = []
  const edges = []
  // % of income — shown on every node and on each flow edge. Up to 2 decimals,
  // trailing zeros trimmed (12 → "12%", 12.5 → "12.5%", 0.43 → "0.43%"); a
  // non-zero amount under 0.01% shows "<0.01%" rather than collapsing to "0%".
  const pctText = (amt) => {
    if (!income || amt <= 0) return ''
    const p = (amt / income) * 100
    if (p < 0.01) return '<0.01%'
    return `${p.toFixed(2).replace(/\.?0+$/, '')}%`
  }
  const addNode = (n) => nodes.push({
    id: n.id, type: 'money', position: { x: n.x, y: n.y }, draggable: true,
    data: { kind: n.kind, eyebrow: n.eyebrow, label: n.label, amount: n.amount, currency, pct: pctText(n.amount), sub: n.sub, accent: n.accent, badge: n.badge, dim: n.dim },
  })
  // Edge thickness encodes magnitude (kept in a sane range so it never overwhelms
  // the nodes); the % of income rides on the edge as a label. No arrowheads — the
  // layout is strictly left→right.
  const wOf = (amt) => Math.max(1.4, Math.min(6, 1.2 + (amt / Math.max(1, income)) * 7))
  const addEdge = (from, to, amt, color, animated = false) => {
    if (amt <= 0) return
    edges.push({
      id: `${from}~${to}`, source: from, target: to, animated, type: 'default',
      style: { stroke: color, strokeWidth: wOf(amt) },
      label: pctText(amt),
      labelStyle: { fill: 'var(--muted-foreground)', fontSize: '10px', fontWeight: 600 },
      labelBgStyle: { fill: 'var(--card)' },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
    })
  }
  const fundBadge = (id) => (archivedFundIds.has(id) ? 'Archived' : pausedFundIds.has(id) ? 'paused' : undefined)

  // ── Left tree: income → accounts → items ───────────────────────────────────
  const itemsByAcc = new Map()
  const unassigned = []
  for (const it of items) {
    const acc = assignment.get(it.id)
    if (acc && d.accountById.has(acc)) {
      if (!itemsByAcc.has(acc)) itemsByAcc.set(acc, [])
      itemsByAcc.get(acc).push(it)
    }
    else unassigned.push(it)
  }
  const groups = []
  for (const a of accounts) if (itemsByAcc.has(a.id)) groups.push({ accId: a.id, name: nameOf(a.id), archived: a.archived, items: itemsByAcc.get(a.id) })
  if (unassigned.length) groups.push({ accId: 'unassigned', name: 'Unassigned', warn: true, items: unassigned })

  const totalSources = items.reduce((s, i) => s + i.amount, 0)
  const kept = income - totalSources

  const itemAccent = (it) => (it.type === 'fixed' || it.type === 'variable') ? C.expense : it.type === 'save' ? C.save : it.type === 'mf' ? C.mf : C.stocks
  let cursor = 0
  for (const g of groups) {
    const band = Math.max(1, g.items.length) * ROW
    const accId = `acc-${g.accId}`
    const accAmt = g.warn ? g.items.reduce((s, i) => s + i.amount, 0) : d.sumFor(g.accId)
    addNode({ id: accId, x: X.account, y: cursor + band / 2 - NODE_H / 2, kind: g.warn ? 'warn' : 'account', eyebrow: g.warn ? 'Not assigned' : 'Account', label: g.name, amount: accAmt, accent: g.warn ? C.warn : C.account, badge: g.archived ? 'Archived' : undefined })
    addEdge('income', accId, accAmt, g.warn ? C.warn : C.transfer, true)
    g.items.forEach((it, i) => {
      const accent = itemAccent(it)
      const eyebrow = it.type === 'fixed' ? 'Fixed' : it.type === 'variable' ? (it.daily ? 'Daily' : 'Variable') : it.type === 'save' ? 'Savings' : it.type === 'mf' ? '→ Mutual Funds' : '→ Stocks'
      const kind = (it.type === 'fixed' || it.type === 'variable') ? 'expense' : it.type === 'save' ? 'save' : it.type
      addNode({ id: it.id, x: X.item, y: cursor + i * ROW + (ROW - NODE_H) / 2, kind, eyebrow, label: it.label, amount: it.amount, accent, badge: it.daily ? 'Daily' : undefined })
      addEdge(accId, it.id, it.amount, accent)
    })
    cursor += band
  }
  if (kept > 1) {
    addNode({ id: 'kept', x: X.account, y: cursor + ROW / 2 - NODE_H / 2, kind: 'kept', eyebrow: 'Not allocated', label: 'Kept in income', amount: kept, accent: C.idle })
    addEdge('income', 'kept', kept, C.idle)
    cursor += ROW
  }
  const leftH = Math.max(cursor, ROW)
  addNode({ id: 'income', x: X.income, y: leftH / 2 - NODE_H / 2, kind: 'income', eyebrow: 'Income', label: 'Income', amount: income, accent: C.income })

  // ── Right forest: pools → buckets / direct funds → fund & stock leaves ──────
  const fNodes = []
  const fEdges = []
  let fc = 0
  let fundCount = 0
  const buildPool = (poolId, b, accent, label) => {
    if (!b || (b.pool ?? 0) <= 0) return
    const start = fc
    for (const r of b.rows) {
      if (r.amount <= 0) continue
      if (r.kind === 'fund') {
        const leaf = b.holdings.find((h) => h.allocId === r.id)
        const lid = `lf-${poolId}-${r.id}`
        fNodes.push({ id: lid, x: X.fund, y: fc + (ROW - NODE_H) / 2, kind: poolId === 'stocks' ? 'stock' : 'fund', eyebrow: 'Direct', label: leaf?.name || 'Fund', amount: r.amount, accent, badge: leaf ? fundBadge(leaf.id) : undefined, dim: !leaf })
        fEdges.push({ from: `pool-${poolId}`, to: lid, amt: r.amount, color: accent })
        fundCount++
        fc += ROW
      }
      else {
        const leaves = b.holdings.filter((h) => h.allocId === r.id && h.amount > 0)
        const band = Math.max(1, leaves.length) * ROW
        const bid = `bk-${poolId}-${r.id}`
        fNodes.push({ id: bid, x: X.bucket, y: fc + band / 2 - NODE_H / 2, kind: 'bucket', eyebrow: 'Goal', label: r.bucket || 'Unbucketed', amount: r.amount, accent })
        fEdges.push({ from: `pool-${poolId}`, to: bid, amt: r.amount, color: accent })
        leaves.forEach((h, i) => {
          const lid = `lf-${poolId}-${r.id}-${h.id}`
          fNodes.push({ id: lid, x: X.fund, y: fc + i * ROW + (ROW - NODE_H) / 2, kind: poolId === 'stocks' ? 'stock' : 'fund', label: h.name, amount: h.amount, accent, badge: fundBadge(h.id), dim: archivedFundIds.has(h.id) })
          fEdges.push({ from: bid, to: lid, amt: h.amount, color: accent })
          fundCount++
        })
        fc += band
      }
    }
    const resid = (b.pool || 0) - (b.resolvedTotal || 0)
    if (resid > 1) {
      const rid = `unrouted-${poolId}`
      fNodes.push({ id: rid, x: X.bucket, y: fc + (ROW - NODE_H) / 2, kind: 'warn', eyebrow: 'Attention', label: 'Not yet routed', amount: resid, accent: C.warn })
      fEdges.push({ from: `pool-${poolId}`, to: rid, amt: resid, color: C.warn })
      fc += ROW
    }
    const mid = start + (fc - start) / 2 - NODE_H / 2
    fNodes.push({ id: `pool-${poolId}`, x: X.pool, y: mid, kind: poolId === 'stocks' ? 'stocks' : 'mf', eyebrow: 'Pool', label, amount: b.pool, accent })
    fc += ROW * 0.7 // gap between pools
  }
  const pools = investmentPools(month)
  buildPool('mf', bd.mf, C.mf, 'Mutual Funds')
  buildPool('stocks', bd.stocks, C.stocks, 'Stocks')

  const forestH = Math.max(fc, 0)
  const offset = leftH / 2 - forestH / 2
  for (const n of fNodes) { n.y += offset; addNode(n) }
  for (const e of fEdges) addEdge(e.from, e.to, e.amt, e.color)

  // cross edges: each investment-routed item → its pool
  for (const it of items) {
    if (it.type === 'mf') addEdge(it.id, 'pool-mf', it.amount, C.mf, true)
    else if (it.type === 'stocks') addEdge(it.id, 'pool-stocks', it.amount, C.stocks, true)
  }

  return {
    nodes,
    edges,
    reconcile: { balanced: d.balanced, summary: reconcileSummary(d) },
    counts: { accounts: groups.filter((g) => !g.warn).length, items: items.length, funds: fundCount, pools: (pools.mf > 0 ? 1 : 0) + (pools.stocks > 0 ? 1 : 0) },
  }
}
