// Conservation + correctness invariants for the full money-map graph builder.
import { describe, it, expect } from 'vitest'
import { buildMoneyGraph } from './useMoneyGraph.js'

const accounts = [{ id: 'a1', name: 'Bank' }]

// income 10000 − expenses 4000 → surplus 6000; 50% MF / 50% savings.
function baseMonth(income = 10000) {
  return {
    income,
    currency: 'USD',
    fixedExpenses: [{ id: 'f1', item: 'Rent', amount: 3000 }],
    variableExpenses: [{ id: 'v1', item: 'Food', amount: 1000, isDailyBudget: true }],
    surplus: [
      { id: 's1', item: 'MF', mode: 'PCT', value: 50, target: 'MUTUAL_FUNDS' },
      { id: 's2', item: 'Save', mode: 'PCT', value: 50, target: null },
    ],
    flow: { incomeAccountId: 'a1', allocations: [{ accountId: 'a1', sourceIds: ['f1', 'v1', 's1', 's2'] }] },
    investments: {
      mf: [{ id: 'r1', kind: 'bucket', bucket: 'B', mode: 'PCT', value: 100, funds: [{ fundId: 'h1', pct: 100 }] }],
      stocks: [],
      holdings: [{ id: 'h1', kind: 'mutualFund', name: 'Fund A', bucket: 'B', active: true }],
      holdingsFrozen: true,
    },
  }
}

const node = (g, id) => g.nodes.find((n) => n.id === id)
const hasEdge = (g, from, to) => g.edges.some((e) => e.source === from && e.target === to)

describe('buildMoneyGraph', () => {
  it('conserves income across the account column', () => {
    const g = buildMoneyGraph({ month: baseMonth(), accounts })
    const sum = g.nodes.filter((n) => n.id.startsWith('acc-') || n.id === 'kept').reduce((a, n) => a + n.data.amount, 0)
    expect(sum).toBe(10000)
  })

  it('continues investments from the pool (no income → pool double count)', () => {
    const g = buildMoneyGraph({ month: baseMonth(), accounts })
    expect(g.edges.some((e) => e.source === 'income' && e.target.startsWith('pool-'))).toBe(false)
    expect(hasEdge(g, 's1', 'pool-mf')).toBe(true) // the MF surplus line feeds the pool
    expect(hasEdge(g, 'pool-mf', 'bk-mf-r1')).toBe(true) // pool → bucket
  })

  it('emits a node for every individual fund leaf', () => {
    const g = buildMoneyGraph({ month: baseMonth(), accounts })
    expect(g.counts.funds).toBe(1)
    expect(g.nodes.some((n) => n.id.startsWith('lf-mf-'))).toBe(true)
  })

  it('builds an account node per receiving account, plus the income root', () => {
    const g = buildMoneyGraph({ month: baseMonth(), accounts })
    expect(node(g, 'income')).toBeTruthy()
    expect(node(g, 'acc-a1')).toBeTruthy()
    expect(node(g, 'acc-a1').data.amount).toBe(10000)
  })

  it('drops investment pools on a deficit', () => {
    const g = buildMoneyGraph({ month: baseMonth(2000), accounts })
    expect(node(g, 'pool-mf')).toBeFalsy()
    expect(node(g, 'pool-stocks')).toBeFalsy()
  })

  it('flags unassigned sources without dropping money', () => {
    const m = baseMonth()
    m.flow.allocations = [{ accountId: 'a1', sourceIds: ['f1', 'v1'] }] // s1/s2 unassigned
    const g = buildMoneyGraph({ month: m, accounts })
    expect(node(g, 'acc-unassigned')).toBeTruthy()
    const sum = g.nodes.filter((n) => n.id.startsWith('acc-') || n.id === 'kept').reduce((a, n) => a + n.data.amount, 0)
    expect(sum).toBe(10000)
    expect(g.reconcile.balanced).toBe(false)
  })
})
