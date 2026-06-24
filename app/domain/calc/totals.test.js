import { describe, it, expect } from 'vitest'
import {
  totalFixed, totalVariable, totalExpenses, surplus,
  surplusAmounts, surplusPctAssigned, resolveSourceById, sourceAmountMap,
} from './totals.js'

const body = {
  income: 100000, // 1000.00
  fixedExpenses: [
    { id: 'f1', item: 'Rent', amount: 40000 },
    { id: 'f2', item: 'Phone', amount: 10000 },
  ],
  variableExpenses: [
    { id: 'v1', item: 'Groceries', amount: 20000, isDailyBudget: true },
  ],
  surplus: [
    { id: 's1', item: 'Savings', mode: 'PCT', value: 50 },
    { id: 's2', item: 'Emergency', mode: 'AMOUNT', value: 5000 },
  ],
}

describe('totals', () => {
  it('sums fixed, variable and total expenses', () => {
    expect(totalFixed(body)).toBe(50000)
    expect(totalVariable(body)).toBe(20000)
    expect(totalExpenses(body)).toBe(70000)
  })
  it('computes surplus = income - expenses (can be negative)', () => {
    expect(surplus(body)).toBe(30000)
    expect(surplus({ income: 100, fixedExpenses: [{ id: 'a', amount: 500 }] })).toBe(-400)
  })
})

describe('surplusAmounts', () => {
  it('resolves PCT against the surplus pool and AMOUNT verbatim', () => {
    const res = surplusAmounts(body)
    // pool = 30000; PCT 50% -> 15000; AMOUNT -> 5000
    expect(res.find((r) => r.id === 's1').amount).toBe(15000)
    expect(res.find((r) => r.id === 's2').amount).toBe(5000)
  })
  it('clamps the pool at 0 for a negative surplus (PCT -> 0; AMOUNT keeps value)', () => {
    const deficit = { income: 100, fixedExpenses: [{ id: 'a', amount: 100000 }], surplus: body.surplus }
    const res = surplusAmounts(deficit)
    expect(res.find((r) => r.id === 's1').amount).toBe(0)
    expect(res.find((r) => r.id === 's2').amount).toBe(5000)
  })
  it('allows over-allocation (sum can exceed the pool)', () => {
    const over = { income: 100000, surplus: [{ id: 'x', mode: 'PCT', value: 150 }] }
    // pool 100000, 150% -> 150000
    expect(surplusAmounts(over)[0].amount).toBe(150000)
    expect(surplusPctAssigned(over)).toBe(150)
  })
})

describe('source resolution', () => {
  it('builds a map of every allocatable line id -> amount', () => {
    const m = sourceAmountMap(body)
    expect(m.get('f1')).toBe(40000)
    expect(m.get('v1')).toBe(20000)
    expect(m.get('s1')).toBe(15000) // resolved surplus
  })
  it('resolveSourceById returns 0 for unknown ids', () => {
    expect(resolveSourceById(body, 'f1')).toBe(40000)
    expect(resolveSourceById(body, 'nope')).toBe(0)
  })
})
