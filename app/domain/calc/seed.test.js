import { describe, it, expect } from 'vitest'
import { yearlyItemsDueIn, buildMonthSeed, monthNumber } from './seed.js'

const monthly = {
  id: 'mv1',
  currency: 'INR',
  income: 100000,
  fixedExpenses: [{ id: 'f1', item: 'Rent', amount: 40000, order: 0 }],
  variableExpenses: [{ id: 'v1', item: 'Food', amount: 20000, isDailyBudget: true, order: 0 }],
  surplus: [{ id: 's1', item: 'Savings', mode: 'PCT', value: 100, order: 0 }],
  flow: { incomeAccountId: 'accA', allocations: [{ accountId: 'accB', sourceIds: ['f1'] }] },
  todos: [
    { id: 't1', label: 'Pay rent', isAuto: false, order: 0 },
    { id: 't2', label: 'old auto', isAuto: true, order: 1 },
  ],
}

const yearly = {
  id: 'yv1',
  currency: 'INR',
  fixedExpenses: [
    { id: 'yf1', item: 'Insurance', amount: 120000, recurMonth: 6, recurDay: 15, order: 0 },
    { id: 'yf2', item: 'Domain', amount: 1000, recurMonth: 3, recurDay: 1, order: 1 },
  ],
  variableExpenses: [],
}

describe('monthNumber', () => {
  it('extracts the month number', () => {
    expect(monthNumber('2026-06')).toBe(6)
    expect(monthNumber('2026-12')).toBe(12)
  })
})

describe('yearlyItemsDueIn', () => {
  it('returns only rows due that month with fresh ids and YEARLY source', () => {
    const due = yearlyItemsDueIn(yearly, '2026-06')
    expect(due.fixedExpenses).toHaveLength(1)
    expect(due.fixedExpenses[0].item).toBe('Insurance')
    expect(due.fixedExpenses[0].id).not.toBe('yf1')
    expect(due.fixedExpenses[0].source).toBe('YEARLY')
  })
  it('returns nothing for a month with no due items', () => {
    expect(yearlyItemsDueIn(yearly, '2026-01').fixedExpenses).toHaveLength(0)
  })
})

describe('buildMonthSeed', () => {
  const seed = buildMonthSeed(monthly, yearly, '2026-06', 'INR', { accB: { name: 'ICICI' } })

  it('stamps currency, month and seededFrom', () => {
    expect(seed.currency).toBe('INR')
    expect(seed.month).toBe('2026-06')
    expect(seed.seededFrom).toEqual({ monthlyVersionId: 'mv1', yearlyVersionId: 'yv1' })
    expect(seed.income).toBe(100000)
  })

  it('assigns fresh ids to copied rows (so plan ids never leak in)', () => {
    expect(seed.fixedExpenses.every((l) => l.id !== 'f1')).toBe(true)
    expect(seed.fixedExpenses.find((l) => l.source === 'MONTHLY').item).toBe('Rent')
  })

  it('merges the yearly items due that month', () => {
    expect(seed.fixedExpenses.some((l) => l.item === 'Insurance' && l.source === 'YEARLY')).toBe(true)
    expect(seed.fixedExpenses).toHaveLength(2)
  })

  it('remaps flow source references to the new ids', () => {
    const rentRow = seed.fixedExpenses.find((l) => l.item === 'Rent')
    const alloc = seed.flow.allocations.find((a) => a.accountId === 'accB')
    expect(alloc.sourceIds).toContain(rentRow.id)
    expect(alloc.sourceIds).not.toContain('f1')
    expect(seed.flow.incomeAccountId).toBe('accA')
  })

  it('copies only manual to-dos and regenerates auto transfer to-dos', () => {
    const labels = seed.checklist.map((c) => c.label)
    expect(labels).toContain('Pay rent')
    expect(labels).not.toContain('old auto') // stale auto to-do dropped
    expect(seed.checklist.some((c) => c.isAuto && /Transfer/.test(c.label))).toBe(true)
    expect(seed.checklist.every((c) => c.isDone === false)).toBe(true)
  })
})

describe('buildMonthSeed — investments snapshot + target carry + round-trip', () => {
  const investmentPlan = {
    mfRouting: [{ id: 'r1', bucket: 'emergency', mode: 'PCT', value: 100, order: 0 }],
    stockRouting: [],
  }
  const monthlyWithRouting = {
    ...monthly,
    surplus: [{ id: 's1', item: 'MFs', mode: 'PCT', value: 100, target: 'MUTUAL_FUNDS', order: 0 }],
  }

  it('freezes a holdings snapshot: excludes archived, keeps paused (active:false), no archived field', () => {
    const investments = [
      { id: 'f1', kind: 'mutualFund', name: 'Active F', bucket: 'long term', active: true, archived: false },
      { id: 'f2', kind: 'mutualFund', name: 'Paused F', bucket: 'long term', active: false, archived: false },
      { id: 'f3', kind: 'mutualFund', name: 'Archived F', bucket: 'long term', active: true, archived: true },
      { id: 's1', kind: 'stock', name: 'Stock A', bucket: 'core', active: true, archived: false },
    ]
    const seed = buildMonthSeed(monthlyWithRouting, null, '2026-06', 'INR', {}, investmentPlan, investments)
    const ids = seed.investments.holdings.map((h) => h.id)
    expect(ids).toEqual(['f1', 'f2', 's1']) // archived f3 excluded
    expect(seed.investments.holdings.find((h) => h.id === 'f2').active).toBe(false) // paused kept
    expect(seed.investments.holdings.every((h) => !('archived' in h))).toBe(true) // no archived field
  })

  it('snapshots the routing plan and carries the surplus target into the month', async () => {
    const { investmentPools } = await import('./investments.js')
    const { monthSchema } = await import('../schemas.js')
    const seed = buildMonthSeed(monthlyWithRouting, null, '2026-06', 'INR', { accB: { name: 'ICICI' } }, investmentPlan)
    expect(seed.investments.mf).toHaveLength(1)
    expect(seed.investments.mf[0].bucket).toBe('emergency')
    expect(seed.surplus[0].target).toBe('MUTUAL_FUNDS')

    // Round-trip through the Zod converter (parse) — guards the schema-before-seed
    // ordering: target + investments must survive read-back.
    const readback = monthSchema.parse(seed)
    expect(readback.surplus[0].target).toBe('MUTUAL_FUNDS')
    expect(readback.investments.mf).toHaveLength(1)
    expect(investmentPools(readback).mf).toBeGreaterThan(0)
  })

  it('keeps a routed surplus line in the materialized bank-flow allocations (it flows through the account)', () => {
    const monthly = {
      ...monthlyWithRouting,
      flow: { incomeAccountId: 'accA', allocations: [{ accountId: 'accB', sourceIds: ['f1', 's1'] }] }, // s1 routed to MFs
    }
    const seed = buildMonthSeed(monthly, null, '2026-06', 'INR', { accB: { name: 'ICICI' } }, investmentPlan)
    const routedNewId = seed.surplus[0].id
    expect(seed.flow.allocations.flatMap((a) => a.sourceIds)).toContain(routedNewId)
  })

  it('generates an inv:mf auto-checklist item that survives the converter', async () => {
    const { monthSchema } = await import('../schemas.js')
    const seed = buildMonthSeed(monthlyWithRouting, null, '2026-06', 'INR', {}, investmentPlan)
    const inv = seed.checklist.find((c) => c.accountId === 'inv:mf')
    expect(inv).toBeTruthy()
    expect(monthSchema.parse(seed).checklist.some((c) => c.accountId === 'inv:mf')).toBe(true)
  })
})
