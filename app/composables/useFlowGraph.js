// Pure mapping between the flow model and Vue Flow nodes/edges (no Vue Flow
// import — testable in plain JS). The `flow` object stays the single source of
// truth; positions/edges are a projection.
//
// flow = { incomeAccountId: string|null, allocations: [{ accountId, sourceIds[] }] }

import { titleSlot } from '../lib/nodeLayout.js'

export const NONE = '__none__'
export const UNASSIGNED_ID = '__unassigned__'
const ORPHAN_PREFIX = '__orphan__'
export const orphanId = (accId) => `${ORPHAN_PREFIX}${accId}`
export const isOrphanId = (id) => typeof id === 'string' && id.startsWith(ORPHAN_PREFIX)
export const orphanAccId = (id) => (isOrphanId(id) ? id.slice(ORPHAN_PREFIX.length) : null)
export const isSyntheticId = (id) => id === UNASSIGNED_ID || isOrphanId(id) || id === NONE || id == null

// Vue Flow position/marker enums are plain strings — use them directly so this
// module needs no Vue Flow import. Left→right tree columns.
const TREE_X = { income: 0, col1: 380, col2: 760 }
const ROW_GAP = 104
// Leaf (expense, w-52) title wrapping: ~chars per line + px added per extra line,
// so multi-line names get a taller slot and never overlap the node below.
const LEAF_CPL = 20
const LEAF_LINE = 22
export const BANK_PREFIX = 'bank-'
export const EXP_PREFIX = 'exp-'
export const bankNodeId = (accId) => `${BANK_PREFIX}${accId}`
export const expenseNodeId = (srcId) => `${EXP_PREFIX}${srcId}`

/** flow.allocations → Map<sourceId, accountId> (ALL stored ids, incl. ones not in sources). */
export function flattenAssignment(flow) {
  const m = new Map()
  for (const a of flow?.allocations ?? []) {
    for (const sid of a.sourceIds ?? []) m.set(sid, a.accountId)
  }
  return m
}

/**
 * Assign (or unassign) a source to an account, returning a NEW flow object.
 * Preserves incomeAccountId and every other allocation untouched (lossless),
 * exactly like the original FlowMapper.rebuild(). Passing a synthetic/NONE/null
 * account unassigns the source.
 */
export function assignInFlow(flow, sourceId, accountId) {
  let allocations = (flow?.allocations ?? []).map((a) => ({
    accountId: a.accountId,
    sourceIds: (a.sourceIds ?? []).filter((s) => s !== sourceId),
  }))
  if (!isSyntheticId(accountId)) {
    const existing = allocations.find((a) => a.accountId === accountId)
    if (existing) existing.sourceIds.push(sourceId)
    else allocations.push({ accountId, sourceIds: [sourceId] })
  }
  allocations = allocations.filter((a) => a.sourceIds.length > 0)
  return { incomeAccountId: flow?.incomeAccountId ?? null, allocations }
}

/** Set the income account (NONE/null clears it). Allocations preserved. */
export function setIncomeInFlow(flow, accountId) {
  return {
    incomeAccountId: accountId && accountId !== NONE ? accountId : null,
    allocations: (flow?.allocations ?? []).map((a) => ({ accountId: a.accountId, sourceIds: [...(a.sourceIds ?? [])] })),
  }
}

/** Derived reconcile/summary state shared by the preview and the editor. */
export function deriveFlow(sources, accounts, flow) {
  const assignment = flattenAssignment(flow)
  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]))
  const list = sources ?? []
  const unassigned = list.filter((s) => !assignment.get(s.id))
  const orphanedSources = list.filter((s) => {
    const acc = assignment.get(s.id)
    return acc && !accountById.has(acc)
  })
  const orphanAccountIds = new Set()
  for (const [, acc] of assignment) if (acc && !accountById.has(acc)) orphanAccountIds.add(acc)
  // Archived accounts still RESOLVE (in accountById) — they are NOT orphans; they
  // just render with an "Archived" badge. (Orphan = genuinely-unknown / purged id.)
  const archivedAccountIds = new Set()
  for (const [, acc] of assignment) if (accountById.get(acc)?.archived) archivedAccountIds.add(acc)
  const incomeMissing = !!flow?.incomeAccountId && !accountById.has(flow.incomeAccountId)
  const incomeArchived = !!accountById.get(flow?.incomeAccountId)?.archived

  // Allocations referencing a sourceId no longer present in sources[] (a line
  // item was deleted but its allocation was preserved). This term mirrors
  // reconcile()'s orphanSourceIds. NOTE: the editor pill is intentionally
  // STRICTER than domain reconcile().balanced — it also flags deleted-account
  // allocations (orphanedSources) and a removed income account (incomeMissing),
  // which reconcile() treats as still-balanced. It surfaces more problems, by design.
  const sourceIdSet = new Set(list.map((s) => s.id))
  const staleSourceIds = []
  for (const sid of assignment.keys()) if (!sourceIdSet.has(sid)) staleSourceIds.push(sid)

  const sumFor = (accId) => list.filter((s) => assignment.get(s.id) === accId).reduce((t, s) => t + (s.amount ?? 0), 0)
  const countFor = (accId) => list.filter((s) => assignment.get(s.id) === accId).length
  const balanced = unassigned.length === 0 && orphanedSources.length === 0 && staleSourceIds.length === 0 && !incomeMissing

  return {
    assignment, accountById, unassigned, orphanedSources, staleSourceIds,
    orphanAccountIds: [...orphanAccountIds], incomeMissing,
    archivedAccountIds: [...archivedAccountIds], incomeArchived,
    sumFor, countFor, balanced,
    assignedCount: list.length - unassigned.length,
    total: list.length,
  }
}

/** Human-readable summary string for the reconcile pill (matches old footer). */
export function reconcileSummary(d) {
  if (d.balanced) return 'Every item is assigned to an account.'
  return [
    d.unassigned.length ? `${d.unassigned.length} unassigned` : '',
    d.orphanedSources.length ? `${d.orphanedSources.length} need a new account` : '',
    d.staleSourceIds?.length ? `${d.staleSourceIds.length} stale` : '',
    d.incomeMissing ? 'income account removed' : '',
  ].filter(Boolean).join(' · ')
}

// Edge styling by kind (CLAUDE.md color hierarchy): 'transfer' (income→bank,
// BLUE), 'surplus' (→ a surplus item, GREEN = saving) or 'spend' (→ an expense,
// RED). Straight lines (no bends).
function edgeStyle(kind) {
  const stroke = kind === 'transfer' ? 'var(--auto)' : kind === 'surplus' ? 'var(--positive)' : 'var(--negative)'
  return {
    animated: true,
    type: 'straight',
    style: { stroke, strokeWidth: kind === 'transfer' ? 2.5 : 1.75 },
    markerEnd: { type: 'arrowclosed', color: stroke },
  }
}
const spendKind = (s) => (s?.kind === 'surplus' ? 'surplus' : 'spend')

/**
 * The set of bank account ids that should appear as bank nodes (transfer
 * targets): real accounts — other than the income account — that either have
 * ≥1 expense allocated, or were added during this editing session (`placed`).
 * The income account is the income node itself, not a separate bank node.
 * @returns {string[]} account ids in `accounts` order
 */
export function visibleBankIds(sources, accounts, flow, placed = []) {
  const d = deriveFlow(sources, accounts, flow)
  const incomeId = flow?.incomeAccountId
  return (accounts ?? [])
    .map((a) => a.id)
    .filter((id) => id !== incomeId && (d.countFor(id) > 0 || placed.includes(id)))
}

/**
 * Build the left→right TREE: Income (root) → bank transfer nodes (green) and
 * income's own expense leaves (red), then each bank's expense leaves (red).
 * Pure + testable. Deterministic two-pass Y layout (no layout library).
 * @returns {{ nodes: object[], edges: object[] }}
 */
export function buildTree({ sources, accounts, flow, income = 0, currency, placed = [] }) {
  const d = deriveFlow(sources, accounts, flow)
  const list = sources ?? []
  const accs = accounts ?? []
  const incomeId = flow?.incomeAccountId ?? null
  const childrenOf = (accId) => list.filter((s) => d.assignment.get(s.id) === accId)

  const nodes = []
  const edges = []

  // Root income node (col 0). y set after layout.
  nodes.push({
    id: 'income', type: 'income', position: { x: TREE_X.income, y: 0 },
    // `accounts` = full (resolution); `pickableAccounts` = active-only (the select options).
    data: { income, currency, incomeAccountId: incomeId, incomeMissing: d.incomeMissing, incomeArchived: d.incomeArchived, accounts: accs, pickableAccounts: accs.filter((a) => !a.archived) },
  })

  // col-1 groups in order: banks (with col-2 children), income's own expenses
  // (leaves), then deleted-account orphan buckets (with children).
  const groups = []
  for (const accId of visibleBankIds(sources, accounts, flow, placed)) {
    groups.push({ kind: 'bank', accId, children: childrenOf(accId) })
  }
  if (incomeId && d.accountById.has(incomeId)) {
    for (const s of childrenOf(incomeId)) groups.push({ kind: 'incomeExpense', source: s, children: [] })
  }
  for (const accId of d.orphanAccountIds) {
    if (d.countFor(accId) > 0) groups.push({ kind: 'orphan', accId, children: childrenOf(accId) })
  }

  const expenseNode = (s, x, y) => {
    nodes.push({ id: expenseNodeId(s.id), type: 'expense', position: { x, y }, data: { sourceId: s.id, item: s.item, amount: s.amount, kind: s.kind, currency } })
  }

  // Each leaf's slot grows with its wrapped title; the parent stays centered
  // against the children band (single-line names keep the old ROW_GAP spacing).
  const leafSlot = (s) => titleSlot(s.item || 'Untitled', ROW_GAP, LEAF_CPL, LEAF_LINE)
  let cursor = 0
  for (const g of groups) {
    if (g.kind === 'incomeExpense') {
      const band = leafSlot(g.source)
      expenseNode(g.source, TREE_X.col1, cursor + (band - ROW_GAP) / 2)
      edges.push({ ...edgeStyle(spendKind(g.source)), id: `e-${g.source.id}`, source: 'income', target: expenseNodeId(g.source.id) })
      cursor += band
      continue
    }
    const slots = g.children.map(leafSlot)
    const band = Math.max(ROW_GAP, slots.reduce((a, b) => a + b, 0))
    const parentY = cursor + (band - ROW_GAP) / 2
    const parentId = g.kind === 'bank' ? bankNodeId(g.accId) : orphanId(g.accId)
    if (g.kind === 'bank') {
      nodes.push({
        id: bankNodeId(g.accId), type: 'bank', position: { x: TREE_X.col1, y: parentY },
        data: { accountId: g.accId, name: d.accountById.get(g.accId)?.name ?? '', total: d.sumFor(g.accId), count: d.countFor(g.accId), archived: !!d.accountById.get(g.accId)?.archived, currency },
      })
      edges.push({ ...edgeStyle('transfer'), id: `t-${g.accId}`, source: 'income', target: bankNodeId(g.accId) })
    }
    else {
      nodes.push({ id: orphanId(g.accId), type: 'orphan', position: { x: TREE_X.col1, y: parentY }, data: { accId: g.accId, count: d.countFor(g.accId), accounts: accs, currency } })
    }
    let y = cursor
    g.children.forEach((s, i) => {
      expenseNode(s, TREE_X.col2, y)
      edges.push({ ...edgeStyle(spendKind(s)), id: `e-${s.id}`, source: parentId, target: expenseNodeId(s.id) })
      y += slots[i]
    })
    cursor += band
  }

  // Center the income node vertically against the whole tree.
  nodes[0].position.y = (Math.max(ROW_GAP, cursor) - ROW_GAP) / 2

  return { nodes, edges }
}
