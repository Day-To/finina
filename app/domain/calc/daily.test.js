import { describe, it, expect } from 'vitest'
import { daysInMonth, dailyBudget, dailySummary, groupByDate } from './daily.js'

describe('daysInMonth', () => {
  it('returns calendar days for a period', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2024-02')).toBe(29) // leap year
    expect(daysInMonth('2026-06')).toBe(30)
    expect(daysInMonth('2026-07')).toBe(31)
  })
})

const month = {
  month: '2026-06',
  variableExpenses: [
    { id: 'v1', amount: 30000, isDailyBudget: true },
    { id: 'v2', amount: 5000, isDailyBudget: true },
    { id: 'v3', amount: 9999, isDailyBudget: false }, // excluded
  ],
}

describe('dailyBudget', () => {
  it('sums only daily-budget-flagged variable expenses', () => {
    expect(dailyBudget(month)).toBe(35000)
  })
})

describe('dailySummary', () => {
  it('computes budget, spent and remaining', () => {
    const s = dailySummary(month, [{ amount: 10000 }, { amount: 5000 }])
    expect(s.budget).toBe(35000)
    expect(s.spent).toBe(15000)
    expect(s.remaining).toBe(20000)
    expect(s.daysInMonth).toBe(30)
    expect(s.count).toBe(2)
  })
  it('reports a negative remaining when over budget', () => {
    const s = dailySummary(month, [{ amount: 40000 }])
    expect(s.remaining).toBe(-5000)
  })
})

describe('groupByDate', () => {
  it('groups by date newest-first with per-day totals', () => {
    const groups = groupByDate([
      { date: '2026-06-01', amount: 100 },
      { date: '2026-06-03', amount: 200 },
      { date: '2026-06-03', amount: 300 },
    ])
    expect(groups[0].date).toBe('2026-06-03')
    expect(groups[0].total).toBe(500)
    expect(groups[1].date).toBe('2026-06-01')
  })
})
