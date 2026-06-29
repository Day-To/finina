// Pure builder for the full end-to-end money map (rendered with Vue Flow). No
// Vue / Firebase import — testable in plain JS, mirroring useFlowGraph.js. Splices
// the two trees at the surplus join so EVERY item is a node:
//   Income → bank accounts → each expense/surplus line → investment pools →
//   buckets / direct funds → every individual fund & stock.
// Direct-to-holding surplus lines bypass the pool: they edge straight to their
// specific fund/stock leaf (counted = emerald solid; Parked = green dashed + badge).
// Conservation: income → {accounts, unassigned, kept} sums to income; the pool
// chain is a continuation of the pool nodes (no double count).

import { surplusAmounts, sourceAmountMap, investmentPools, investmentBreakdown } from '../domain/calc/index.js'
import { flattenAssignment, deriveFlow, reconcileSummary } from './useFlowGraph.js'
import { titleSlot } from '../lib/nodeLayout.js'

// Semantic finance families (see CLAUDE.md "Color hierarchy"): transfer = blue
// (income + accounts), spend = red (expenses), saving = green, investment =
// emerald (mutual funds + stocks as two emerald shades). 'warn' = attention.
const C = {
  income: 'var(--auto)', account: 'var(--transfer-2)', transfer: 'var(--transfer-2)',
  expense: 'var(--negative)', save: 'var(--positive)',
  mf: 'var(--invest)', stocks: 'var(--invest-2)',
  idle: 'var(--muted-foreground)', warn: '#f43f5e',
}
const X = { income: 0, account: 320, item: 690, pool: 1080, bucket: 1430, fund: 1780 }
const NODE_H = 66
const ROW = 96 // vertical slot per single-line leaf (node + gap)
// MoneyFlowNode (w-210, 13px title) wrapping: ~chars per line + px per extra line.
// A single-line title keeps the ROW slot exactly; extra wrapped lines add height.
const LEAF_CPL = 19
const LEAF_LINE = 18
const slotOf = (label) => titleSlot(label, ROW, LEAF_CPL, LEAF_LINE)

/**
 * @returns {{ nodes: object[], edges: object[], reconcile: {balanced:boolean, summary:string}, counts: object }}
 */
export function buildMoneyGraph({ month, accounts = [], accountsById = null, registry = [], currency, archivedFundIds = new Set(), pausedFundIds = new Set() } = {}) {
  const empty = { nodes: [], edges: [], reconcile: { balanced: true, summary: '' }, counts: { accounts: 0, items: 0, funds: 0 } }
  if (!month) return empty
  const income = Math.max(0, month.income ?? 0)
  const nameOf = (id) => (accountsById?.get ? accountsById.get(id)?.name : accounts.find((a) => a.id === id)?.name) || 'Account'

  const sAmts = surplusAmounts(month)
  const amountOf = sourceAmountMap(month)
  const assignment = flattenAssignment(month.flow)
  const bd = investmentBreakdown(month, registry)

  // Direct-target lookups (name + validity per type), from the breakdown.
  const nameByFund = new Map()
  const validDirect = { mf: new Set(), stocks: new Set() }
  for (const d of bd.mf.direct) { nameByFund.set(d.fundId, d.name); validDirect.mf.add(d.fundId) }
  for (const d of bd.stocks.direct) { nameByFund.set(d.fundId, d.name); validDirect.stocks.add(d.fundId) }

  // Every allocatable line as a graph item.
  const items = []
  for (const l of month.fixedExpenses || []) items.push({ id: l.id, label: l.item || 'Fixed', amount: amountOf.get(l.id) || 0, type: 'fixed' })
  for (const l of month.variableExpenses || []) items.push({ id: l.id, label: l.item || 'Variable', amount: amountOf.get(l.id) || 0, type: 'variable', daily: !!l.isDailyBudget })
  for (const s of sAmts) {
    const t = s.target
    const type = t === 'MUTUAL_FUNDS' ? 'mf' : t === 'STOCKS' ? 'stocks' : 'save'
    const fundId = (type !== 'save' && s.targetFundId) ? s.targetFundId : null
    items.push({ id: s.id, label: s.item || 'Surplus', amount: s.amount, type, fundId, counted: s.countAsInvestment !== false })
  }
  const d = deriveFlow(items, accounts, month.flow)

  const nodes = []
  const edges = []
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

  // Money's COLOUR is its nature; direct money lands in a fund but a PARKED line is
  // saving (green). Counted direct + pool investment = emerald.
  const itemAccent = (it) => {
    if (it.type === 'fixed' || it.type === 'variable') return C.expense
    if (it.type === 'save') return C.save
    if (it.fundId && !it.counted) return C.save // parked
    return it.type === 'stocks' ? C.stocks : C.mf
  }
  const itemEyebrow = (it) => {
    if (it.type === 'fixed') return 'Fixed'
    if (it.type === 'variable') return it.daily ? 'Daily' : 'Variable'
    if (it.type === 'save') return 'Savings'
    if (it.fundId) return `→ ${nameByFund.get(it.fundId) || 'Fund'}${it.counted ? '' : ' · Parked'}`
    return it.type === 'mf' ? '→ Mutual Funds' : '→ Stocks'
  }
  const itemBadge = (it) => (it.fundId && !it.counted ? 'Parked' : it.daily ? 'Daily' : undefined)

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

  let cursor = 0
  for (const g of groups) {
    const slots = g.items.map((it) => slotOf(it.label))
    const band = Math.max(ROW, slots.reduce((a, c) => a + c, 0))
    const accId = `acc-${g.accId}`
    const accAmt = g.warn ? g.items.reduce((s, i) => s + i.amount, 0) : d.sumFor(g.accId)
    addNode({ id: accId, x: X.account, y: cursor + band / 2 - NODE_H / 2, kind: g.warn ? 'warn' : 'account', eyebrow: g.warn ? 'Not assigned' : 'Account', label: g.name, amount: accAmt, accent: g.warn ? C.warn : C.account, badge: g.archived ? 'Archived' : undefined })
    addEdge('income', accId, accAmt, g.warn ? C.warn : C.transfer, true)
    let iy = cursor
    g.items.forEach((it, i) => {
      const accent = itemAccent(it)
      const kind = (it.type === 'fixed' || it.type === 'variable') ? 'expense' : it.type === 'save' ? 'save' : it.type
      addNode({ id: it.id, x: X.item, y: iy + (slots[i] - NODE_H) / 2, kind, eyebrow: itemEyebrow(it), label: it.label, amount: it.amount, accent, badge: itemBadge(it) })
      addEdge(accId, it.id, it.amount, accent)
      iy += slots[i]
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
  const leafIndex = new Map() // `${poolId}:${fundId}` -> leaf node (for merge)
  let fc = 0
  let fundCount = 0
  const buildPool = (poolId, b, accent, label) => {
    if (!b || (b.pool ?? 0) <= 0) return
    const start = fc
    for (const r of b.rows) {
      if (r.amount <= 0) continue
      if (r.kind === 'fund') {
        const leaf = b.holdings.find((h) => h.allocId === r.id)
        const slot = slotOf(leaf?.name || 'Fund')
        const node = { id: `lf-${poolId}-${r.id}`, x: X.fund, y: fc + (slot - NODE_H) / 2, kind: poolId === 'stocks' ? 'stock' : 'fund', eyebrow: 'Direct', label: leaf?.name || 'Fund', amount: r.amount, accent, badge: leaf ? fundBadge(leaf.id) : undefined, dim: !leaf }
        fNodes.push(node)
        if (leaf) leafIndex.set(`${poolId}:${leaf.id}`, node)
        fEdges.push({ from: `pool-${poolId}`, to: node.id, amt: r.amount, color: accent })
        fundCount++
        fc += slot
      }
      else {
        const leaves = b.holdings.filter((h) => h.allocId === r.id && h.amount > 0)
        const slots = leaves.map((h) => slotOf(h.name))
        const band = Math.max(ROW, slots.reduce((a, c) => a + c, 0))
        const bid = `bk-${poolId}-${r.id}`
        fNodes.push({ id: bid, x: X.bucket, y: fc + band / 2 - NODE_H / 2, kind: 'bucket', eyebrow: 'Goal', label: r.bucket || 'Unbucketed', amount: r.amount, accent })
        fEdges.push({ from: `pool-${poolId}`, to: bid, amt: r.amount, color: accent })
        let ly = fc
        leaves.forEach((h, i) => {
          const node = { id: `lf-${poolId}-${r.id}-${h.id}`, x: X.fund, y: ly + (slots[i] - NODE_H) / 2, kind: poolId === 'stocks' ? 'stock' : 'fund', label: h.name, amount: h.amount, accent, badge: fundBadge(h.id), dim: archivedFundIds.has(h.id) }
          fNodes.push(node)
          leafIndex.set(`${poolId}:${h.id}`, node)
          fEdges.push({ from: bid, to: node.id, amt: h.amount, color: accent })
          fundCount++
          ly += slots[i]
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

  // ── Direct routings: each direct surplus item → its specific fund leaf ──────
  for (const it of items.filter((x) => x.fundId)) {
    const poolId = it.type // 'mf' | 'stocks'
    const accent = poolId === 'stocks' ? C.stocks : C.mf
    const key = `${poolId}:${it.fundId}`
    let leaf = leafIndex.get(key)
    if (!leaf && validDirect[poolId]?.has(it.fundId)) {
      const slot = slotOf(nameByFund.get(it.fundId) || 'Fund')
      leaf = { id: `lf-direct-${poolId}-${it.fundId}`, x: X.fund, y: fc + (slot - NODE_H) / 2, kind: poolId === 'stocks' ? 'stock' : 'fund', eyebrow: 'Direct', label: nameByFund.get(it.fundId) || 'Fund', amount: 0, accent, badge: fundBadge(it.fundId) }
      fNodes.push(leaf)
      leafIndex.set(key, leaf)
      fundCount++
      fc += slot
    }
    if (leaf) {
      leaf.amount += it.amount // a fund may get pool + direct (and several direct lines)
      if (!it.counted && !leaf.badge) leaf.badge = 'Parked'
      // counted = emerald solid; parked = green dashed (its money is saving).
      fEdges.push({ from: it.id, to: leaf.id, amt: it.amount, color: it.counted ? accent : C.save, animated: !it.counted })
    }
    else {
      // direct route to a fund missing from this month → visible attention node
      const wid = `lf-invalid-${it.id}`
      fNodes.push({ id: wid, x: X.fund, y: fc + (ROW - NODE_H) / 2, kind: 'warn', eyebrow: 'Attention', label: 'Fund not found', amount: it.amount, accent: C.warn })
      fEdges.push({ from: it.id, to: wid, amt: it.amount, color: C.warn, animated: true })
      fc += ROW
    }
  }

  const forestH = Math.max(fc, 0)
  const offset = leftH / 2 - forestH / 2
  for (const n of fNodes) { n.y += offset; addNode(n) }
  for (const e of fEdges) addEdge(e.from, e.to, e.amt, e.color, e.animated)

  // cross edges: each POOL-routed investment item → its pool node (direct items
  // already edge to their leaf above).
  for (const it of items) {
    if (it.fundId) continue
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
