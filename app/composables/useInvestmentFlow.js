// Pure mapping between an investment routing array and Vue Flow nodes/edges
// (no Vue Flow import — testable in plain JS). Mirrors useFlowGraph.js. The
// routing array stays the single source of truth; positions/edges are a
// projection. Single-pool oriented: one Pool node per editor instance.
//
// routing = [ { id, kind:'bucket', bucket, mode, value, funds:[{fundId,pct}] }
//           | { id, kind:'fund', fundId, mode, value } ]
import { investmentTypeBreakdown } from '../domain/calc/investments.js'
import { newId } from '../domain/ids.js'
import { formatMoney } from '../domain/money.js'
import { titleSlot } from '../lib/nodeLayout.js'

export const POOL_PREFIX = 'pool-'
export const BUCKET_PREFIX = 'bk-'
export const FUND_PREFIX = 'fund-'
export const poolNodeId = (poolKey) => `${POOL_PREFIX}${poolKey}`
export const bucketNodeId = (allocId) => `${BUCKET_PREFIX}${allocId}`
export const fundNodeId = (allocId, fundId) => `${FUND_PREFIX}${allocId}-${fundId}` // allocId-scoped: same fund under two buckets never collides

const TREE_X = { pool: 0, col1: 380, col2: 760 }
const ROW_GAP = 104
// Fund-leaf (w-52) sizing. The investment fund node also carries a routing-control
// row (the % input), so its single-line height (~108px) is TALLER than ROW_GAP —
// LEAF_BASE is its slot incl. an inter-node gap, and titles wrap to the full name
// adding LEAF_LINE px per extra line.
const LEAF_CPL = 20
const LEAF_LINE = 22
const LEAF_BASE = 144 // single-line fund-leaf slot (node + control row + gap)
const BUCKET_H = 150 // bucket node nominal height (for centering + min band)

/** Wrap the calc breakdown with a `balanced` flag (mirrors deriveFlow). */
export function deriveInvestment(pool, routing, holdings) {
  const b = investmentTypeBreakdown(pool, routing, holdings)
  const P = Math.max(0, Number(pool) || 0)
  const balanced = b.stranded.length === 0 && b.unrouted.length === 0 && b.invalidFundRows.length === 0
    && !b.overFunded && b.total === b.resolvedTotal && b.total === P
  return { ...b, balanced }
}

/** Human-readable reconcile-pill summary (mirrors reconcileSummary). */
export function reconcileInvestmentSummary(d) {
  if (d.balanced) return 'Routed in full.'
  return [
    d.unrouted.length ? `${d.unrouted.length} fund(s) not routed` : '',
    d.stranded.length ? `${d.stranded.length} bucket(s) empty` : '',
    d.invalidFundRows.length ? `${d.invalidFundRows.length} fund row(s) invalid` : '',
    d.overFunded ? 'fixed exceeds pool' : '',
    d.total !== d.resolvedTotal ? 'amounts unresolved' : '',
  ].filter(Boolean).join(' · ')
}

// Investment routing is all EMERALD (CLAUDE.md color hierarchy): 'route'
// (Pool→bucket/fund) uses the base emerald, 'fund' (bucket→fund) a lighter shade.
function edgeStyle(kind) {
  const stroke = kind === 'route' ? 'var(--invest)' : 'var(--invest-2)'
  return { animated: true, type: 'straight', style: { stroke, strokeWidth: kind === 'route' ? 2.5 : 1.75 }, markerEnd: { type: 'arrowclosed', color: stroke } }
}
const routeLabel = (r, currency) => (r.mode === 'AMOUNT' ? `${formatMoney(r.amount, currency)} fixed` : `${r.value}% · ${formatMoney(r.amount, currency)}`)

// ── Lossless mutators (return a NEW routing array; preserve order + untouched fields) ──
export function addBucket(routing, bucket = '') {
  return [...(routing ?? []), { id: newId(), kind: 'bucket', bucket, mode: 'PCT', value: 0, funds: [], order: routing?.length ?? 0 }]
}
export function addSingleFund(routing, fundId) {
  return [...(routing ?? []), { id: newId(), kind: 'fund', fundId, mode: 'PCT', value: 0, order: routing?.length ?? 0 }]
}
export function addFundToBucket(routing, allocId, fundId) {
  return (routing ?? []).map((r) => {
    if (r.id !== allocId || r.kind !== 'bucket') return r
    if ((r.funds ?? []).some((f) => f.fundId === fundId)) return r
    return { ...r, funds: [...(r.funds ?? []), { fundId, pct: 0 }] }
  })
}
export function setFundPct(routing, allocId, fundId, pct) {
  return (routing ?? []).map((r) => {
    if (r.id !== allocId || r.kind !== 'bucket') return r
    const funds = [...(r.funds ?? [])]
    const i = funds.findIndex((f) => f.fundId === fundId)
    if (i >= 0) funds[i] = { ...funds[i], pct }
    else funds.push({ fundId, pct })
    return { ...r, funds }
  })
}
export function setAllocMode(routing, allocId, mode) {
  if (!mode) return routing ?? []
  return (routing ?? []).map((r) => (r.id === allocId ? { ...r, mode, value: 0 } : r)) // reset value on mode change
}
export function setAllocValue(routing, allocId, value) {
  return (routing ?? []).map((r) => (r.id === allocId ? { ...r, value } : r))
}
export function removeAlloc(routing, allocId) {
  return (routing ?? []).filter((r) => r.id !== allocId).map((r, i) => ({ ...r, order: i }))
}
export function detachFund(routing, allocId, fundId) {
  return (routing ?? []).map((r) => (r.id === allocId && r.kind === 'bucket' ? { ...r, funds: (r.funds ?? []).filter((f) => f.fundId !== fundId) } : r))
}
export function distributeEvenly(routing, allocId, fundIds) {
  const pct = fundIds.length ? Math.round(100 / fundIds.length) : 0
  return (routing ?? []).map((r) => (r.id === allocId && r.kind === 'bucket' ? { ...r, funds: fundIds.map((fundId) => ({ fundId, pct })) } : r))
}

/**
 * Build the left→right tree: Pool (root) → bucket nodes (→ fund leaves) and
 * → direct fund nodes. Deterministic two-pass Y layout (mirrors buildTree).
 * @returns {{ nodes: object[], edges: object[] }}
 */
export function buildInvestmentTree({ poolKey, pool, routing, holdings, currency, archivedFundIds = new Set(), pausedFundIds = new Set() }) {
  const d = deriveInvestment(pool, routing, holdings)
  const leavesByAlloc = new Map()
  for (const leaf of d.holdings) {
    if (!leavesByAlloc.has(leaf.allocId)) leavesByAlloc.set(leaf.allocId, [])
    leavesByAlloc.get(leaf.allocId).push(leaf)
  }

  const nodes = []
  const edges = []
  const poolId = poolNodeId(poolKey)
  nodes.push({
    id: poolId, type: 'pool', position: { x: TREE_X.pool, y: 0 },
    data: { poolKey, pool, routed: d.total, resolvedTotal: d.resolvedTotal, currency },
  })

  // Fund-leaf slot grows with its wrapped name (LEAF_BASE accounts for the control
  // row); leaves stack top-down and the bucket is centered against the band.
  const leafSlot = (name) => titleSlot(name, LEAF_BASE, LEAF_CPL, LEAF_LINE)
  let cursor = 0
  for (const r of d.rows) {
    if (r.kind === 'fund') {
      const leaf = (leavesByAlloc.get(r.id) ?? [])[0]
      nodes.push({
        id: fundNodeId(r.id, r.fundId), type: 'fund', position: { x: TREE_X.col1, y: cursor },
        data: { allocId: r.id, parentKind: 'pool', fundId: r.fundId, name: leaf?.name ?? '(missing fund)', amount: r.amount, pct: 100, mode: r.mode, value: r.value, invalid: !leaf, archived: archivedFundIds.has(r.fundId), paused: pausedFundIds.has(r.fundId), currency },
      })
      edges.push({ ...edgeStyle('route'), id: `route-${r.id}`, source: poolId, target: fundNodeId(r.id, r.fundId), label: routeLabel(r, currency) })
      cursor += leafSlot(leaf?.name ?? '(missing fund)')
    }
    else {
      const leaves = leavesByAlloc.get(r.id) ?? []
      const slots = leaves.map((leaf) => leafSlot(leaf.name))
      const band = Math.max(BUCKET_H + 30, slots.reduce((a, b) => a + b, 0))
      const parentY = cursor + (band - BUCKET_H) / 2
      nodes.push({
        id: bucketNodeId(r.id), type: 'bucket', position: { x: TREE_X.col1, y: parentY },
        data: { allocId: r.id, bucket: r.bucket, mode: r.mode, value: r.value, amount: r.amount, count: leaves.length, funds: r.funds ?? [], currency },
      })
      edges.push({ ...edgeStyle('route'), id: `route-${r.id}`, source: poolId, target: bucketNodeId(r.id), label: routeLabel(r, currency) })
      const rawPctOf = (fundId) => (r.funds ?? []).find((f) => f.fundId === fundId)?.pct ?? null
      let y = cursor
      leaves.forEach((leaf, i) => {
        nodes.push({
          id: fundNodeId(r.id, leaf.fundId), type: 'fund', position: { x: TREE_X.col2, y },
          data: { allocId: r.id, parentKind: 'bucket', fundId: leaf.fundId, name: leaf.name, amount: leaf.amount, pct: leaf.pct, rawPct: rawPctOf(leaf.fundId), archived: archivedFundIds.has(leaf.fundId), paused: pausedFundIds.has(leaf.fundId), currency },
        })
        edges.push({ ...edgeStyle('fund'), id: `fund-${r.id}-${leaf.fundId}`, source: bucketNodeId(r.id), target: fundNodeId(r.id, leaf.fundId), label: `${leaf.pct}% · ${formatMoney(leaf.amount, currency)}` })
        y += slots[i]
      })
      cursor += band
    }
  }

  // Center the pool node vertically against the whole tree.
  nodes[0].position.y = (Math.max(ROW_GAP, cursor) - ROW_GAP) / 2
  return { nodes, edges }
}
