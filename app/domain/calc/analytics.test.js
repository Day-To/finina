import { describe, it, expect } from 'vitest'
import {
  monthlySeries, expenseCategories, fixedVsVariable, surplusAllocationSeries,
  investmentSeries, investedByType, investedByBucket, dailyAnalysis, analyticsKpis,
} from './analytics.js'

// Two months (minor units). Given out of order to prove chronological sorting.
const M = [
  {
    month: '2026-06', income: 15000000,
    fixedExpenses: [{ id: 'f', item: 'Rent', amount: 5000000 }],
    variableExpenses: [{ id: 'v', item: 'Living Budget', amount: 3000000, isDailyBudget: true }],
    surplus: [
      { id: 's3', item: 'Mutual Funds', mode: 'PCT', value: 40, target: 'MUTUAL_FUNDS' },
      { id: 's4', item: 'Stocks', mode: 'PCT', value: 10, target: 'STOCKS' },
      { id: 's5', item: 'Emergency Fund', mode: 'PCT', value: 50, target: null },
    ],
  },
  {
    month: '2026-05', income: 14000000,
    fixedExpenses: [{ id: 'f', item: 'Rent', amount: 5000000 }],
    variableExpenses: [{ id: 'v', item: 'Living Budget', amount: 2000000, isDailyBudget: true }],
    surplus: [
      { id: 's1', item: 'Mutual Funds', mode: 'PCT', value: 50, target: 'MUTUAL_FUNDS' },
      { id: 's2', item: 'Emergency Fund', mode: 'PCT', value: 50, target: null },
    ],
  },
]

describe('monthlySeries', () => {
  const s = monthlySeries(M)
  it('sorts chronologically and computes headline figures', () => {
    expect(s.map((x) => x.month)).toEqual(['2026-05', '2026-06'])
    expect(s[0]).toMatchObject({ income: 14000000, expenses: 7000000, fixed: 5000000, variable: 2000000, surplus: 7000000, mf: 3500000, stocks: 0, invested: 3500000 })
    expect(s[0].savingsRate).toBeCloseTo(0.5)
    expect(s[1]).toMatchObject({ expenses: 8000000, mf: 2800000, stocks: 700000, invested: 3500000 })
  })
})

describe('expenseCategories / fixedVsVariable', () => {
  it('aggregates lines by item, ranked', () => {
    const c = expenseCategories(M)
    expect(c[0]).toMatchObject({ item: 'Rent', fixed: 10000000, variable: 0, total: 10000000 })
    expect(c.find((r) => r.item === 'Living Budget')).toMatchObject({ variable: 5000000, total: 5000000 })
    expect(expenseCategories(M, 1)).toHaveLength(1)
  })
  it('splits fixed vs variable totals', () => {
    expect(fixedVsVariable(M)).toEqual({ fixed: 10000000, variable: 5000000, total: 15000000 })
  })
})

describe('surplusAllocationSeries', () => {
  it('orders items by all-time total and maps per-month values', () => {
    const { items, series } = surplusAllocationSeries(M)
    expect(items[0]).toBe('Emergency Fund') // 7,000,000 total — the largest
    expect(items).toContain('Mutual Funds')
    expect(items).toContain('Stocks')
    expect(series[0].month).toBe('2026-05')
    expect(series[0].values['Mutual Funds']).toBe(3500000)
    expect(series[1].values.Stocks).toBe(700000)
  })
})

describe('investmentSeries / investedByType', () => {
  it('accumulates invested over time', () => {
    const s = investmentSeries(M)
    expect(s[0].cumulative).toBe(3500000)
    expect(s[1].cumulative).toBe(7000000)
  })
  it('splits MF vs stocks all-time', () => {
    expect(investedByType(M)).toEqual({ mf: 6300000, stocks: 700000, total: 7000000 })
  })
})

describe('dailyAnalysis', () => {
  it('aggregates by item label + per-month total', () => {
    const d = dailyAnalysis({ '2026-06': [{ item: 'Groceries', amount: 50000 }, { item: 'Groceries', amount: 30000 }, { item: 'Fuel', amount: 100000 }] })
    expect(d.items[0]).toEqual({ item: 'Fuel', total: 100000, count: 1 })
    expect(d.items.find((r) => r.item === 'Groceries')).toEqual({ item: 'Groceries', total: 80000, count: 2 })
    expect(d.byMonth['2026-06']).toBe(180000)
    expect(d.total).toBe(180000)
    expect(d.count).toBe(3)
  })
})

describe('investedByBucket', () => {
  it('groups by bucket and folds bucket-less stocks into "Stocks"', () => {
    const m = {
      month: '2026-06', income: 1000000,
      surplus: [
        { id: 'm', item: 'MF', mode: 'AMOUNT', value: 100000, target: 'MUTUAL_FUNDS' },
        { id: 's', item: 'Stk', mode: 'AMOUNT', value: 50000, target: 'STOCKS' },
      ],
      investments: {
        mf: [{ id: 'a1', kind: 'fund', fundId: 'f1', mode: 'AMOUNT', value: 100000 }],
        stocks: [{ id: 'a2', kind: 'fund', fundId: 's1', mode: 'AMOUNT', value: 50000 }],
        holdings: [
          { id: 'f1', kind: 'mutualFund', name: 'Fund', bucket: 'emergency', active: true },
          { id: 's1', kind: 'stock', name: 'Stock', bucket: '', active: true },
        ],
        holdingsFrozen: true,
      },
    }
    const rows = investedByBucket([m], [])
    expect(rows).toEqual([{ bucket: 'emergency', amount: 100000 }, { bucket: 'Stocks', amount: 50000 }])
  })
})

describe('monthlySeries — deficit', () => {
  it('reports a negative savings rate when expenses exceed income', () => {
    const s = monthlySeries([{ month: '2026-01', income: 1000000, fixedExpenses: [{ id: 'x', item: 'Rent', amount: 1300000 }], surplus: [] }])
    expect(s[0].surplus).toBe(-300000)
    expect(s[0].savingsRate).toBeCloseTo(-0.3)
  })
})

describe('analyticsKpis', () => {
  it('summarizes the series', () => {
    const k = analyticsKpis(monthlySeries(M))
    expect(k.months).toBe(2)
    expect(k.avgIncome).toBe(14500000)
    expect(k.totalInvested).toBe(7000000)
    expect(k.best.month).toBe('2026-05') // higher surplus rate... equal surplus, ties to first
    expect(k.overallSavingsRate).toBeCloseTo(14000000 / 29000000)
  })
  it('returns null for an empty series', () => {
    expect(analyticsKpis([])).toBe(null)
  })
})
