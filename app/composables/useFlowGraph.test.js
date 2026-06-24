import { describe, it, expect } from 'vitest'
import {
  flattenAssignment, assignInFlow, setIncomeInFlow, deriveFlow, buildTree, visibleBankIds, bankNodeId, expenseNodeId, orphanId, NONE, UNASSIGNED_ID,
} from './useFlowGraph.js'

const sources = [
  { id: 'f1', item: 'Rent', amount: 40000 },
  { id: 'v1', item: 'Food', amount: 20000 },
  { id: 's1', item: 'Savings', amount: 15000 },
]
const accounts = [{ id: 'a', name: 'HDFC' }, { id: 'b', name: 'ICICI' }]

describe('assignInFlow', () => {
  it('assigns a source to an account, preserving income + other allocations', () => {
    const flow = { incomeAccountId: 'a', allocations: [{ accountId: 'b', sourceIds: ['v1'] }] }
    const next = assignInFlow(flow, 'f1', 'a')
    expect(next.incomeAccountId).toBe('a')
    expect(flattenAssignment(next).get('f1')).toBe('a')
    expect(flattenAssignment(next).get('v1')).toBe('b') // untouched
  })
  it('reassigns (removes from old account) — at most one account per source', () => {
    const flow = { incomeAccountId: null, allocations: [{ accountId: 'a', sourceIds: ['f1'] }] }
    const next = assignInFlow(flow, 'f1', 'b')
    const m = flattenAssignment(next)
    expect(m.get('f1')).toBe('b')
    expect(next.allocations.find((al) => al.accountId === 'a')).toBeUndefined() // emptied + dropped
  })
  it('unassigns on NONE / synthetic targets and drops empty allocations', () => {
    const flow = { incomeAccountId: null, allocations: [{ accountId: 'a', sourceIds: ['f1'] }] }
    expect(assignInFlow(flow, 'f1', NONE).allocations).toEqual([])
    expect(assignInFlow(flow, 'f1', UNASSIGNED_ID).allocations).toEqual([])
  })
  it('preserves an allocation for a sourceId that is NOT in the current sources[] (losslessness)', () => {
    // 'ghost' was assigned previously but its line item was later deleted.
    const flow = { incomeAccountId: 'a', allocations: [{ accountId: 'b', sourceIds: ['ghost'] }] }
    const next = assignInFlow(flow, 'f1', 'a') // editing an unrelated source
    expect(flattenAssignment(next).get('ghost')).toBe('b')
  })
})

describe('setIncomeInFlow', () => {
  it('sets and clears the income account, preserving allocations', () => {
    const flow = { incomeAccountId: null, allocations: [{ accountId: 'a', sourceIds: ['f1'] }] }
    expect(setIncomeInFlow(flow, 'b').incomeAccountId).toBe('b')
    expect(setIncomeInFlow(flow, 'b').allocations).toEqual(flow.allocations)
    expect(setIncomeInFlow(flow, NONE).incomeAccountId).toBe(null)
  })
  it('only an explicit income change clears an orphaned incomeAccountId', () => {
    const flow = { incomeAccountId: 'deleted', allocations: [{ accountId: 'a', sourceIds: ['f1'] }] }
    // an allocation-only edit keeps the orphan income
    expect(assignInFlow(flow, 'v1', 'b').incomeAccountId).toBe('deleted')
    // explicit clear works
    expect(setIncomeInFlow(flow, NONE).incomeAccountId).toBe(null)
  })
})

describe('deriveFlow', () => {
  it('computes unassigned, totals, and balanced', () => {
    const flow = { incomeAccountId: 'a', allocations: [{ accountId: 'a', sourceIds: ['f1'] }, { accountId: 'b', sourceIds: ['v1'] }] }
    const d = deriveFlow(sources, accounts, flow)
    expect(d.unassigned.map((s) => s.id)).toEqual(['s1'])
    expect(d.sumFor('a')).toBe(40000)
    expect(d.sumFor('b')).toBe(20000)
    expect(d.balanced).toBe(false) // s1 unassigned
  })
  it('flags orphaned sources and missing income account', () => {
    const flow = { incomeAccountId: 'gone', allocations: [{ accountId: 'gone', sourceIds: ['f1'] }] }
    const d = deriveFlow(sources, accounts, flow)
    expect(d.incomeMissing).toBe(true)
    expect(d.orphanedSources.map((s) => s.id)).toEqual(['f1'])
    expect(d.orphanAccountIds).toContain('gone')
  })
})

describe('visibleBankIds', () => {
  it('lists non-income accounts with expenses, plus placed banks, excluding the income account', () => {
    const flow = { incomeAccountId: 'a', allocations: [{ accountId: 'a', sourceIds: ['f1'] }, { accountId: 'b', sourceIds: ['v1'] }] }
    expect(visibleBankIds(sources, accounts, flow)).toEqual(['b']) // 'a' is the income node, not a bank
    expect(visibleBankIds(sources, accounts, { incomeAccountId: 'a', allocations: [] }, ['b'])).toEqual(['b']) // transient placed
  })
})

describe('buildTree', () => {
  it('always emits exactly one income node', () => {
    const { nodes } = buildTree({ sources, accounts, flow: { incomeAccountId: null, allocations: [] }, currency: 'INR' })
    expect(nodes.filter((n) => n.type === 'income')).toHaveLength(1)
  })
  it('renders a green bank node (transfer edge) per non-income bank with its total + count', () => {
    const flow = { incomeAccountId: 'a', allocations: [{ accountId: 'b', sourceIds: ['v1', 's1'] }] }
    const { nodes, edges } = buildTree({ sources, accounts, flow, income: 100000, currency: 'INR' })
    const bank = nodes.find((n) => n.id === bankNodeId('b'))
    expect(bank).toBeTruthy()
    expect(bank.data.total).toBe(35000) // 20000 + 15000
    expect(bank.data.count).toBe(2)
    expect(edges.find((e) => e.id === 't-b')).toMatchObject({ source: 'income', target: bankNodeId('b') })
    expect(edges.find((e) => e.id === 't-b').style.stroke).toBe('var(--positive)') // transfer = green
  })
  it('hangs income-account expenses directly off the income node (no duplicate bank node)', () => {
    const flow = { incomeAccountId: 'a', allocations: [{ accountId: 'a', sourceIds: ['f1'] }] }
    const { nodes, edges } = buildTree({ sources, accounts, flow, currency: 'INR' })
    expect(nodes.find((n) => n.id === bankNodeId('a'))).toBeUndefined() // income acct is not a bank node
    expect(nodes.find((n) => n.id === expenseNodeId('f1'))).toBeTruthy()
    expect(edges.find((e) => e.id === 'e-f1')).toMatchObject({ source: 'income', target: expenseNodeId('f1') })
  })
  it('draws a red spend edge bank→expense and none for unassigned sources', () => {
    const flow = { incomeAccountId: 'a', allocations: [{ accountId: 'b', sourceIds: ['v1'] }] }
    const { edges } = buildTree({ sources, accounts, flow, currency: 'INR' })
    expect(edges.find((e) => e.id === 'e-v1')).toMatchObject({ source: bankNodeId('b'), target: expenseNodeId('v1') })
    expect(edges.find((e) => e.id === 'e-v1').style.stroke).toBe('var(--negative)')
    expect(edges.find((e) => e.id === 'e-f1')).toBeUndefined() // f1 unassigned
  })
  it('shows a transient placed bank with count 0 and no children', () => {
    const flow = { incomeAccountId: 'a', allocations: [] }
    const { nodes } = buildTree({ sources, accounts, flow, currency: 'INR', placed: ['b'] })
    const bank = nodes.find((n) => n.id === bankNodeId('b'))
    expect(bank).toBeTruthy()
    expect(bank.data.count).toBe(0)
  })
  it('renders an orphan node (with children) for a deleted account, not for income-only/stale refs', () => {
    const orphan = buildTree({ sources, accounts, flow: { incomeAccountId: null, allocations: [{ accountId: 'gone', sourceIds: ['f1'] }] }, currency: 'INR' })
    expect(orphan.nodes.find((n) => n.id === orphanId('gone'))).toBeTruthy()
    expect(orphan.edges.find((e) => e.id === 'e-f1').target).toBe(expenseNodeId('f1'))
    expect(orphan.edges.find((e) => e.id === 'e-f1').source).toBe(orphanId('gone'))

    const incomeMissing = buildTree({ sources, accounts, flow: { incomeAccountId: 'gone', allocations: [{ accountId: 'b', sourceIds: ['v1'] }] }, currency: 'INR' })
    expect(incomeMissing.nodes.find((n) => n.type === 'orphan')).toBeUndefined() // income-only-missing: no orphan bucket
    expect(incomeMissing.edges.find((e) => e.id === 't-b')).toBeTruthy() // 'b' is a real bank, gets a transfer edge

    const stale = buildTree({ sources, accounts, flow: { incomeAccountId: 'a', allocations: [{ accountId: 'goneAcct', sourceIds: ['deleted'] }] }, currency: 'INR' })
    expect(stale.nodes.find((n) => n.type === 'orphan')).toBeUndefined() // stale-only: no node
  })
  it('colors a surplus item edge blue (--auto) and tags the node kind', () => {
    const srcs = [{ id: 's1', item: 'Savings', amount: 15000, kind: 'surplus' }]
    const flow = { incomeAccountId: 'a', allocations: [{ accountId: 'b', sourceIds: ['s1'] }] }
    const { nodes, edges } = buildTree({ sources: srcs, accounts, flow, currency: 'INR' })
    expect(edges.find((e) => e.id === 'e-s1').style.stroke).toBe('var(--auto)')
    expect(nodes.find((n) => n.id === expenseNodeId('s1')).data.kind).toBe('surplus')
  })
  it('centers a 2-child bank vertically against its children', () => {
    const flow = { incomeAccountId: 'a', allocations: [{ accountId: 'b', sourceIds: ['v1', 's1'] }] }
    const { nodes } = buildTree({ sources, accounts, flow, currency: 'INR' })
    const bank = nodes.find((n) => n.id === bankNodeId('b'))
    const kids = nodes.filter((n) => n.type === 'expense').sort((a, c) => a.position.y - c.position.y)
    expect(bank.position.y).toBe((kids[0].position.y + kids[1].position.y) / 2)
  })
})

describe('archived accounts (soft-delete)', () => {
  const accs = [{ id: 'a', name: 'HDFC' }, { id: 'b', name: 'ICICI', archived: true }]
  const flow = { incomeAccountId: 'a', allocations: [{ accountId: 'b', sourceIds: ['f1'] }] }

  it('resolves an archived account (not an orphan) and flags it archived', () => {
    const d = deriveFlow(sources, accs, flow)
    expect(d.orphanAccountIds).not.toContain('b') // resolves, so not an orphan
    expect(d.archivedAccountIds).toContain('b')
    expect(d.sumFor('b')).toBe(40000) // amount unaffected by archive
  })
  it('marks income archived when income lands in an archived account', () => {
    const d = deriveFlow(sources, [{ id: 'a', name: 'HDFC', archived: true }, { id: 'b', name: 'ICICI' }], flow)
    expect(d.incomeArchived).toBe(true)
    expect(d.incomeMissing).toBe(false)
  })
  it('buildTree: bank node carries archived; income exposes pickableAccounts (active-only) + full accounts', () => {
    const { nodes } = buildTree({ sources, accounts: accs, flow, currency: 'INR' })
    const bank = nodes.find((n) => n.id === bankNodeId('b'))
    expect(bank.data.archived).toBe(true)
    const income = nodes.find((n) => n.id === 'income')
    expect(income.data.pickableAccounts.some((a) => a.id === 'b')).toBe(false) // archived not pickable
    expect(income.data.accounts.some((a) => a.id === 'b')).toBe(true) // but resolvable
  })
  it('visibleBankIds still includes an archived account that holds allocations', () => {
    expect(visibleBankIds(sources, accs, flow)).toContain('b')
  })
})
