import { describe, it, expect } from 'vitest'
import {
  investmentPools, distributeBuckets, distributeToHoldings, investmentTypeBreakdown, investmentBreakdown, autoInvestmentTodos,
} from './investments.js'
import { accountTransfers } from './flow.js'

describe('investmentPools', () => {
  it('sums tagged surplus lines into mf / stocks pools', () => {
    const body = {
      income: 100000,
      surplus: [
        { id: 'm', item: 'MFs', mode: 'PCT', value: 60, target: 'MUTUAL_FUNDS' },
        { id: 's', item: 'Stocks', mode: 'PCT', value: 40, target: 'STOCKS' },
      ],
    }
    // surplus pool = income 100000 (no expenses); 60% / 40%
    expect(investmentPools(body)).toEqual({ mf: 60000, stocks: 40000 })
  })
  it('ignores untagged surplus lines', () => {
    const body = { income: 100000, surplus: [{ id: 'x', item: 'Savings', mode: 'PCT', value: 100, target: null }] }
    expect(investmentPools(body)).toEqual({ mf: 0, stocks: 0 })
  })
})

describe('distributeBuckets', () => {
  it('takes FIXED first, then splits the remainder across PCT buckets (Σ = pool)', () => {
    const routing = [
      { id: 'e', bucket: 'emergency', mode: 'PCT', value: 50 },
      { id: 'w', bucket: 'wedding', mode: 'PCT', value: 30 },
      { id: 'l', bucket: 'long term', mode: 'AMOUNT', value: 2000000 },
    ]
    const d = distributeBuckets(10000000, routing) // ₹100,000
    const by = Object.fromEntries(d.rows.map((r) => [r.bucket, r.amount]))
    expect(d.fixedTotal).toBe(2000000)
    expect(d.variablePool).toBe(8000000)
    expect(by['long term']).toBe(2000000)
    expect(by.emergency).toBe(5000000) // 8,000,000 × 50/80
    expect(by.wedding).toBe(3000000) // 8,000,000 × 30/80
    expect(d.rows.reduce((s, r) => s + r.amount, 0)).toBe(10000000)
    expect(d.overFunded).toBe(false)
  })
  it('flags overFunded and zeroes PCT when fixed exceeds the pool', () => {
    const routing = [
      { id: 'l', bucket: 'long term', mode: 'AMOUNT', value: 500000 },
      { id: 'e', bucket: 'emergency', mode: 'PCT', value: 100 },
    ]
    const d = distributeBuckets(100000, routing) // ₹1,000 pool, ₹5,000 fixed
    expect(d.overFunded).toBe(true)
    expect(d.rows.find((r) => r.bucket === 'long term').amount).toBe(500000)
    expect(d.rows.find((r) => r.bucket === 'emergency').amount).toBe(0)
  })
  it('normalizes when PCT values do not sum to 100', () => {
    const d = distributeBuckets(1000, [
      { id: 'a', bucket: 'a', mode: 'PCT', value: 1 },
      { id: 'b', bucket: 'b', mode: 'PCT', value: 1 },
    ])
    expect(d.rows[0].amount + d.rows[1].amount).toBe(1000) // full pool allocated
  })
})

describe('distributeToHoldings', () => {
  const ltRow = (funds = []) => [{ id: 'lt', kind: 'bucket', bucket: 'long term', mode: 'PCT', value: 100, funds, amount: 1000 }]
  it('splits equally when no fund pct is set', () => {
    const out = distributeToHoldings(ltRow(), [
      { id: 'a', name: 'A', bucket: 'long term' },
      { id: 'b', name: 'B', bucket: 'long term' },
    ])
    expect(out.map((h) => h.amount)).toEqual([500, 500])
    expect(out.map((h) => h.pct)).toEqual([50, 50])
  })
  it('splits by per-fund pct (normalized) and excludes paused; remainder to largest', () => {
    const out = distributeToHoldings(ltRow([{ fundId: 'a', pct: 75 }, { fundId: 'b', pct: 25 }]), [
      { id: 'a', name: 'A', bucket: 'long term' },
      { id: 'b', name: 'B', bucket: 'long term' },
      { id: 'p', name: 'Paused', bucket: 'long term', active: false },
    ])
    expect(out.find((h) => h.id === 'a').amount).toBe(750)
    expect(out.find((h) => h.id === 'b').amount).toBe(250)
    expect(out.find((h) => h.id === 'p')).toBeUndefined()
    expect(out.reduce((s, h) => s + h.amount, 0)).toBe(1000)
  })
  it('normalizes pct against their sum and surfaces effective pct (80/20 → 800/200)', () => {
    const out = distributeToHoldings(ltRow([{ fundId: 'a', pct: 80 }, { fundId: 'b', pct: 20 }]), [
      { id: 'a', name: 'A', bucket: 'long term' }, { id: 'b', name: 'B', bucket: 'long term' },
    ])
    expect(out.map((h) => h.amount)).toEqual([800, 200])
    expect(out.map((h) => h.pct)).toEqual([80, 20])
  })
  it('over-100 entered pct (80/70) → effective 53/47, amounts 533/467', () => {
    const out = distributeToHoldings(ltRow([{ fundId: 'a', pct: 80 }, { fundId: 'b', pct: 70 }]), [
      { id: 'a', name: 'A', bucket: 'long term' }, { id: 'b', name: 'B', bucket: 'long term' },
    ])
    expect(out.find((h) => h.id === 'a').amount).toBe(533)
    expect(out.find((h) => h.id === 'b').amount).toBe(467)
    expect(out.find((h) => h.id === 'a').pct).toBe(53)
    expect(out.find((h) => h.id === 'b').pct).toBe(47)
  })
  it('a fund omitted from funds[] (pctSum>0) is a 0-amount leaf, not dropped', () => {
    const out = distributeToHoldings(ltRow([{ fundId: 'a', pct: 50 }]), [
      { id: 'a', name: 'A', bucket: 'long term' }, { id: 'c', name: 'C', bucket: 'long term' },
    ])
    expect(out.find((h) => h.id === 'a').amount).toBe(1000)
    expect(out.find((h) => h.id === 'c')).toMatchObject({ amount: 0, pct: 0 })
  })
  it('a single-fund row resolves to one leaf at 100%', () => {
    const out = distributeToHoldings([{ id: 'r', kind: 'fund', fundId: 'a', mode: 'AMOUNT', value: 300, amount: 300 }], [
      { id: 'a', name: 'A', bucket: 'long term' },
    ])
    expect(out).toEqual([{ id: 'a', name: 'A', bucket: 'long term', fundId: 'a', allocId: 'r', pct: 100, amount: 300 }])
  })
  it('a fund routed BOTH solo and via its bucket is paid only by the solo row (no double-pay)', () => {
    const rows = [
      { id: 'solo', kind: 'fund', fundId: 'a', mode: 'AMOUNT', value: 300, amount: 300 },
      { id: 'lt', kind: 'bucket', bucket: 'long term', mode: 'PCT', value: 100, funds: [], amount: 1000 },
    ]
    const out = distributeToHoldings(rows, [
      { id: 'a', name: 'A', bucket: 'long term' }, { id: 'b', name: 'B', bucket: 'long term' },
    ])
    expect(out.filter((h) => h.id === 'a')).toEqual([{ id: 'a', name: 'A', bucket: 'long term', fundId: 'a', allocId: 'solo', pct: 100, amount: 300 }])
    expect(out.find((h) => h.id === 'b').amount).toBe(1000) // bucket renormalizes onto B alone
  })
})

describe('investmentTypeBreakdown', () => {
  it('reports stranded buckets and unrouted holdings', () => {
    const routing = [{ id: 'e', kind: 'bucket', bucket: 'emergency', mode: 'PCT', value: 100 }, { id: 'g', kind: 'bucket', bucket: 'ghost', mode: 'AMOUNT', value: 100 }]
    const holdings = [
      { id: 'a', name: 'A', bucket: 'emergency' },
      { id: 'u', name: 'U', bucket: 'unallocated' },
    ]
    const b = investmentTypeBreakdown(100000, routing, holdings)
    expect(b.stranded).toContain('ghost') // allocation with no holdings
    expect(b.unrouted.map((h) => h.id)).toEqual(['u']) // holding with no allocation
  })
  it('does not report a 0-amount in-bucket leaf as unrouted', () => {
    const routing = [{ id: 'e', kind: 'bucket', bucket: 'emergency', mode: 'PCT', value: 100, funds: [{ fundId: 'a', pct: 100 }] }]
    const holdings = [{ id: 'a', name: 'A', bucket: 'emergency' }, { id: 'c', name: 'C', bucket: 'emergency' }]
    const b = investmentTypeBreakdown(100000, routing, holdings)
    expect(b.unrouted.map((h) => h.id)).toEqual([]) // c is a 0-amount leaf, still routed
  })
  it('flags an invalid single-fund row: counted in total, excluded from resolvedTotal', () => {
    const routing = [{ id: 'r', kind: 'fund', fundId: 'gone', mode: 'AMOUNT', value: 500 }]
    const b = investmentTypeBreakdown(100000, routing, [{ id: 'a', name: 'A', bucket: 'x' }])
    expect(b.invalidFundRows).toHaveLength(1)
    expect(b.total).toBe(500)
    expect(b.resolvedTotal).toBe(0)
  })
})

describe('investment-routed surplus still flows through its bank account', () => {
  it('is transferred to its assigned account AND forms the investment pool', () => {
    const body = {
      income: 100000,
      surplus: [{ id: 'inv', item: 'MFs', mode: 'PCT', value: 100, target: 'MUTUAL_FUNDS' }],
      flow: { incomeAccountId: null, allocations: [{ accountId: 'acc', sourceIds: ['inv'] }] },
    }
    expect(accountTransfers(body).get('acc') ?? 0).toBe(100000) // money moves to the account…
    expect(investmentPools(body).mf).toBe(100000) // …then out to the funds (downstream view)
  })
})

describe('autoInvestmentTodos', () => {
  it('emits stable inv:* keys only for non-zero pools', () => {
    const body = { income: 100000, surplus: [{ id: 'm', item: 'MFs', mode: 'PCT', value: 100, target: 'MUTUAL_FUNDS' }] }
    const todos = autoInvestmentTodos(body, 'INR')
    expect(todos).toHaveLength(1)
    expect(todos[0].accountId).toBe('inv:mf')
    expect(todos[0].isAuto).toBe(true)
    expect(autoInvestmentTodos({ income: 0, surplus: [] }, 'INR')).toEqual([])
  })
})

describe('investmentBreakdown — frozen holdings snapshot keeps a past month stable', () => {
  const month = {
    income: 200000,
    surplus: [{ id: 'm', item: 'MFs', mode: 'AMOUNT', value: 100000, target: 'MUTUAL_FUNDS' }],
    investments: {
      mf: [{ id: 'eb', kind: 'bucket', bucket: 'emergency', mode: 'PCT', value: 100, funds: [] }],
      stocks: [],
      // frozen snapshot at materialize: two active funds in 'emergency'
      holdings: [
        { id: 'f1', kind: 'mutualFund', name: 'Fund 1', bucket: 'emergency', active: true },
        { id: 'f2', kind: 'mutualFund', name: 'Fund 2', bucket: 'emergency', active: true },
      ],
    },
  }
  it('distributes over the frozen snapshot, ignoring the live registry', () => {
    // Live registry: f2 archived/renamed/re-bucketed, f1 gone entirely — must NOT matter.
    const liveRegistry = [{ id: 'f1', kind: 'mutualFund', name: 'RENAMED', bucket: 'other', active: false }]
    const b = investmentBreakdown(month, liveRegistry)
    expect(b.mf.holdings.map((h) => h.id).sort()).toEqual(['f1', 'f2']) // both from the snapshot
    expect(b.mf.holdings.find((h) => h.id === 'f1').amount).toBe(50000) // 100000 split equally
    expect(b.mf.holdings.find((h) => h.id === 'f2').amount).toBe(50000)
    expect(b.mf.unrouted).toEqual([]) // snapshot members are routed, not flagged
  })
  it('falls back to the live registry for a legacy month with no holdings snapshot', () => {
    const legacy = { ...month, investments: { mf: month.investments.mf, stocks: [] } } // no holdings key
    const registry = [{ id: 'f1', kind: 'mutualFund', name: 'Fund 1', bucket: 'emergency', active: true }]
    const b = investmentBreakdown(legacy, registry)
    expect(b.mf.holdings.find((h) => h.id === 'f1').amount).toBe(100000)
  })
})

describe('investmentBreakdown', () => {
  it('splits the registry by kind and routes each pool', () => {
    const month = {
      income: 200000,
      surplus: [
        { id: 'm', item: 'MFs', mode: 'AMOUNT', value: 100000, target: 'MUTUAL_FUNDS' },
        { id: 's', item: 'Stocks', mode: 'AMOUNT', value: 100000, target: 'STOCKS' },
      ],
      investments: {
        mf: [{ id: 'eb', bucket: 'emergency', mode: 'PCT', value: 100 }],
        stocks: [{ id: 'sb', bucket: 'core', mode: 'PCT', value: 100 }],
      },
    }
    const investments = [
      { id: 'f1', kind: 'mutualFund', bucket: 'emergency', active: true },
      { id: 'st1', kind: 'stock', bucket: 'core', active: true },
    ]
    const b = investmentBreakdown(month, investments)
    expect(b.mf.total).toBe(100000)
    expect(b.mf.holdings.find((h) => h.id === 'f1').amount).toBe(100000)
    expect(b.stocks.holdings.find((h) => h.id === 'st1').amount).toBe(100000)
  })
})
