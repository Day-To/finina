// Direct-to-holding surplus routing + "count as investment" (Parked) toggle.
import { describe, it, expect } from 'vitest'
import { surplusLineSchema } from '../schemas.js'
import { investmentPools, directRoutings, investedTotal, investmentBreakdown, autoInvestmentTodos } from './investments.js'
import { monthlySeries, investedByType, investedByBucket, analyticsKpis } from './analytics.js'
import { buildMonthSeed } from './seed.js'
import { buildMoneyGraph } from '../../composables/useMoneyGraph.js'

const holdings = [
  { id: 'fA', kind: 'mutualFund', name: 'Fund A', bucket: 'Long Term', active: true },
  { id: 'fB', kind: 'mutualFund', name: 'Fund B', bucket: 'Wedding', active: true },
  { id: 'fP', kind: 'mutualFund', name: 'Fund Paused', bucket: 'Wedding', active: false },
  { id: 'sA', kind: 'stock', name: 'Stock A', bucket: '', active: true },
]

// income 100000 − expenses 40000 = surplus 60000 (AMOUNT mode for determinism).
function month() {
  return {
    month: '2026-06', currency: 'INR', income: 100000,
    fixedExpenses: [{ id: 'f1', item: 'Rent', amount: 40000 }],
    variableExpenses: [],
    surplus: [
      { id: 's1', item: 'MF pool', mode: 'AMOUNT', value: 30000, target: 'MUTUAL_FUNDS' },
      { id: 's2', item: 'Direct A', mode: 'AMOUNT', value: 10000, target: 'MUTUAL_FUNDS', targetFundId: 'fA', countAsInvestment: true },
      { id: 's3', item: 'Loan Repayment', mode: 'AMOUNT', value: 8000, target: 'MUTUAL_FUNDS', targetFundId: 'fB', countAsInvestment: false },
      { id: 's4', item: 'Direct Stock', mode: 'AMOUNT', value: 5000, target: 'STOCKS', targetFundId: 'sA', countAsInvestment: true },
      { id: 's5', item: 'Savings', mode: 'AMOUNT', value: 7000, target: null },
    ],
    flow: { incomeAccountId: null, allocations: [] },
    investments: {
      mf: [{ id: 'r1', kind: 'bucket', bucket: 'Long Term', mode: 'PCT', value: 100, funds: [{ fundId: 'fA', pct: 100 }] }],
      stocks: [],
      holdings, holdingsFrozen: true,
    },
    checklist: [],
  }
}

describe('schema', () => {
  it('defaults targetFundId=null, countAsInvestment=true; AMOUNT-integer still enforced', () => {
    const p = surplusLineSchema.parse({ id: 'x', item: 'S', mode: 'PCT', value: 10 })
    expect(p.targetFundId).toBe(null)
    expect(p.countAsInvestment).toBe(true)
    expect(surplusLineSchema.safeParse({ id: 'x', item: 'S', mode: 'AMOUNT', value: 1.5 }).success).toBe(false)
  })
})

describe('classification', () => {
  it('investmentPools excludes direct routings (pool-only)', () => {
    expect(investmentPools(month())).toEqual({ mf: 30000, stocks: 0 })
  })
  it('directRoutings lists direct lines with counted flag', () => {
    const d = directRoutings(month())
    expect(d).toHaveLength(3)
    expect(d.find((x) => x.id === 's2')).toMatchObject({ fundId: 'fA', kind: 'mutualFund', amount: 10000, counted: true })
    expect(d.find((x) => x.id === 's3')).toMatchObject({ fundId: 'fB', amount: 8000, counted: false })
  })
  it('investedTotal = pool + counted direct (parked excluded)', () => {
    expect(investedTotal(month())).toEqual({ mf: 40000, stocks: 5000, total: 45000 })
  })
})

describe('investmentBreakdown', () => {
  it('keeps pool fields pool-only (invariants hold) and carries direct separately', () => {
    const b = investmentBreakdown(month())
    // pool invariant: total === pool === resolvedTotal (so the card never falsely warns)
    expect(b.mf.pool).toBe(30000)
    expect(b.mf.total).toBe(30000)
    expect(b.mf.resolvedTotal).toBe(30000)
    expect(b.mf.unrouted).toHaveLength(0) // fB excluded (it gets direct money)
    // direct structure
    expect(b.mf.directTotal).toBe(18000)
    expect(b.mf.directInvested).toBe(10000)
    const fb = b.mf.direct.find((d) => d.fundId === 'fB')
    expect(fb).toMatchObject({ amount: 8000, investAmount: 0, parked: 8000 })
    expect(b.stocks.directTotal).toBe(5000)
    expect(b.stocks.direct[0]).toMatchObject({ fundId: 'sA', investAmount: 5000 })
  })
  it('flags a direct route to a missing/paused fund as invalidDirect', () => {
    const m = month()
    m.surplus.push({ id: 's6', item: 'Bad', mode: 'AMOUNT', value: 1000, target: 'MUTUAL_FUNDS', targetFundId: 'gone' })
    m.surplus.push({ id: 's7', item: 'Paused', mode: 'AMOUNT', value: 1000, target: 'MUTUAL_FUNDS', targetFundId: 'fP' })
    const b = investmentBreakdown(m)
    expect(b.mf.invalidDirect.map((x) => x.fundId).sort()).toEqual(['fP', 'gone'])
  })
})

describe('autoInvestmentTodos', () => {
  it('action totals = pool + ALL direct (counted + parked)', () => {
    const t = autoInvestmentTodos(month(), 'INR')
    const mf = t.find((x) => x.accountId === 'inv:mf')
    const st = t.find((x) => x.accountId === 'inv:stocks')
    expect(mf.label).toContain('Mutual Funds')
    expect(mf.label).toContain('480') // (30000+10000+8000)/100 = ₹480
    expect(st.label).toContain('Stocks')
  })
})

describe('analytics reconciliation', () => {
  it('monthlySeries.invested = investedTotal; parked excluded', () => {
    const s = monthlySeries([month()])[0]
    expect(s.invested).toBe(45000)
    expect(s.mf).toBe(40000)
    expect(s.stocks).toBe(5000)
  })
  it('investedTotal === KPI totalInvested === sum(investedByBucket) when fully resolved', () => {
    const m = month()
    const total = investedTotal(m).total
    const kpi = analyticsKpis(monthlySeries([m])).totalInvested
    const byBucket = investedByBucket([m], holdings).reduce((acc, b) => acc + b.amount, 0)
    expect(kpi).toBe(total)
    expect(byBucket).toBe(total)
    expect(investedByType([m])).toMatchObject({ mf: 40000, stocks: 5000, total: 45000 })
  })
  it('investedByBucket attributes counted direct to its bucket and excludes parked', () => {
    const map = Object.fromEntries(investedByBucket([month()], holdings).map((b) => [b.bucket, b.amount]))
    expect(map['Long Term']).toBe(40000) // pool 30000 (fA) + direct counted 10000 (fA)
    expect(map['Stocks']).toBe(5000)
    expect(map['Wedding']).toBeUndefined() // fB direct was parked → not invested
  })
})

describe('money map (useMoneyGraph)', () => {
  const accounts = [{ id: 'a1', name: 'Bank' }]
  const mg = (surplus) => buildMoneyGraph({
    month: {
      income: 100000, currency: 'INR', fixedExpenses: [], variableExpenses: [], surplus,
      flow: { incomeAccountId: 'a1', allocations: [{ accountId: 'a1', sourceIds: surplus.map((s) => s.id) }] },
      investments: { mf: [], stocks: [], holdings, holdingsFrozen: true },
    },
    accounts, registry: holdings, currency: 'INR',
  })

  it('routes a direct line to its specific fund leaf, not the pool (pool=0 still renders)', () => {
    const g = mg([{ id: 's2', item: 'Direct A', mode: 'AMOUNT', value: 10000, target: 'MUTUAL_FUNDS', targetFundId: 'fA', countAsInvestment: true }])
    expect(g.edges.some((e) => e.source === 's2' && e.target === 'pool-mf')).toBe(false) // no pool cross-edge
    const leafEdge = g.edges.find((e) => e.source === 's2')
    expect(leafEdge.target).toContain('fA') // edges straight to the fund leaf
    expect(g.nodes.some((n) => n.id === leafEdge.target)).toBe(true) // leaf exists even with pool=0
  })

  it('marks a parked direct route (dashed edge + Parked badge)', () => {
    const g = mg([{ id: 's3', item: 'Parked', mode: 'AMOUNT', value: 8000, target: 'MUTUAL_FUNDS', targetFundId: 'fB', countAsInvestment: false }])
    const edge = g.edges.find((e) => e.source === 's3')
    expect(edge.animated).toBe(true)
    const leaf = g.nodes.find((n) => n.id === edge.target)
    expect(leaf.data.badge).toBe('Parked')
  })
})

describe('seed', () => {
  it('preserves targetFundId UNREMAPPED + countAsInvestment', () => {
    const mv = {
      id: 'mv1', currency: 'INR', income: 100000, fixedExpenses: [], variableExpenses: [],
      surplus: [{ id: 'p1', item: 'Direct', mode: 'AMOUNT', value: 5000, target: 'MUTUAL_FUNDS', targetFundId: 'fA', countAsInvestment: false }],
      flow: { incomeAccountId: null, allocations: [] }, todos: [],
    }
    const seed = buildMonthSeed(mv, null, '2026-07', 'INR', null, { mfRouting: [], stockRouting: [] }, holdings)
    expect(seed.surplus[0].targetFundId).toBe('fA') // unremapped holding id
    expect(seed.surplus[0].countAsInvestment).toBe(false)
    expect(seed.surplus[0].id).not.toBe('p1') // line id IS remapped
    // and it resolves against the frozen snapshot
    expect(seed.investments.holdings.some((h) => h.id === 'fA')).toBe(true)
  })
})
