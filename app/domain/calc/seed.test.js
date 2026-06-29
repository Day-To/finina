import { describe, it, expect } from 'vitest'
import { yearlyItemsDueIn, buildMonthSeed, buildMonthCopy, monthNumber } from './seed.js'
import { monthSchema } from '../schemas.js'

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

describe('buildMonthCopy', () => {
  // A materialized source month with: a MONTHLY + a YEARLY fixed line, a MONTHLY
  // variable line, a direct-routed surplus (targetFundId), a frozen holdings
  // snapshot + routing, a flow with one alloc referencing the YEARLY line (so it
  // must fall out) and one alloc referencing ONLY the YEARLY line (→ empty), and a
  // checklist with a done manual item + a stale auto item.
  const source = {
    month: '2026-06',
    currency: 'INR',
    seededFrom: { monthlyVersionId: 'mv1', yearlyVersionId: null },
    income: 100000,
    fixedExpenses: [
      { id: 'f1', item: 'Rent', amount: 40000, order: 0, source: 'MONTHLY' },
      { id: 'fy', item: 'Insurance', amount: 120000, order: 1, source: 'YEARLY' },
    ],
    variableExpenses: [{ id: 'v1', item: 'Food', amount: 20000, isDailyBudget: true, order: 0, source: 'MONTHLY' }],
    surplus: [{ id: 's1', item: 'MFs', mode: 'PCT', value: 100, target: 'MUTUAL_FUNDS', targetFundId: 'h1', countAsInvestment: true, order: 0, source: 'MONTHLY' }],
    flow: {
      incomeAccountId: 'accA',
      allocations: [
        { accountId: 'accB', sourceIds: ['f1', 'v1', 'fy', 's1'] },
        { accountId: 'accC', sourceIds: ['fy'] }, // references ONLY the dropped yearly line
      ],
    },
    investments: {
      mf: [{ id: 'r1', kind: 'bucket', bucket: 'long term', mode: 'PCT', value: 100, funds: [{ fundId: 'h1', pct: 100 }], order: 0 }],
      stocks: [],
      holdings: [{ id: 'h1', kind: 'mutualFund', name: 'Fund A', bucket: 'long term', active: true }],
      holdingsFrozen: true,
    },
    checklist: [
      { id: 'c1', label: 'Call the bank', isDone: true, isAuto: false, order: 0 },
      { id: 'c2', label: 'Transfer ₹1,000 to ICICI', isDone: true, isAuto: true, accountId: 'accB', order: 1 },
    ],
    notes: 'June notes',
    createdAt: 'ts', updatedAt: 'ts',
  }

  const copy = buildMonthCopy(source, '2026-08', 'INR', { accB: { name: 'ICICI' } })

  it('stamps the target month, copies income/currency, resets provenance + notes', () => {
    expect(copy.month).toBe('2026-08')
    expect(copy.currency).toBe('INR')
    expect(copy.income).toBe(100000)
    expect(copy.copiedFrom).toBe('2026-06')
    expect(copy.seededFrom).toBeNull()
    expect(copy.notes).toBe('')
    expect(copy.createdAt).toBeUndefined()
    expect(copy.updatedAt).toBeUndefined()
  })

  it('drops YEARLY-due one-offs but keeps MONTHLY/MANUAL lines verbatim (fresh ids)', () => {
    expect(copy.fixedExpenses).toHaveLength(1)
    const rent = copy.fixedExpenses[0]
    expect(rent.item).toBe('Rent')
    expect(rent.amount).toBe(40000)
    expect(rent.source).toBe('MONTHLY')
    expect(rent.id).not.toBe('f1')
    expect(copy.fixedExpenses.some((l) => l.item === 'Insurance')).toBe(false)
    expect(copy.variableExpenses[0].isDailyBudget).toBe(true)
  })

  it('remaps flow sourceIds old→new and drops refs to the dropped yearly line', () => {
    const allocB = copy.flow.allocations.find((a) => a.accountId === 'accB')
    const rentId = copy.fixedExpenses[0].id
    const foodId = copy.variableExpenses[0].id
    const surplusId = copy.surplus[0].id
    expect(allocB.sourceIds).toEqual(expect.arrayContaining([rentId, foodId, surplusId]))
    expect(allocB.sourceIds).toHaveLength(3) // 'fy' fell out
    expect(allocB.sourceIds).not.toContain('f1')
    expect(allocB.sourceIds).not.toContain('fy')
    expect(copy.flow.incomeAccountId).toBe('accA')
  })

  it('leaves an alloc that referenced only the dropped line with empty (harmless) sourceIds', () => {
    const allocC = copy.flow.allocations.find((a) => a.accountId === 'accC')
    expect(allocC.sourceIds).toEqual([])
  })

  it('preserves targetFundId verbatim (it is a holding id, never remapped)', () => {
    expect(copy.surplus[0].targetFundId).toBe('h1')
    expect(copy.surplus[0].id).not.toBe('s1')
    expect(copy.surplus[0].target).toBe('MUTUAL_FUNDS')
  })

  it('deep-clones routing with fresh ids and copies the frozen holdings snapshot verbatim', () => {
    expect(copy.investments.mf).toHaveLength(1)
    expect(copy.investments.mf[0].id).not.toBe('r1')
    expect(copy.investments.mf[0].bucket).toBe('long term')
    expect(copy.investments.mf[0].funds[0].fundId).toBe('h1')
    expect(copy.investments.holdings).toEqual([{ id: 'h1', kind: 'mutualFund', name: 'Fund A', bucket: 'long term', active: true }])
    expect(copy.investments.holdingsFrozen).toBe(true)
  })

  it('copies only manual to-dos (reset to not-done) and regenerates auto to-dos', () => {
    const labels = copy.checklist.map((c) => c.label)
    expect(labels).toContain('Call the bank')
    const manual = copy.checklist.find((c) => c.label === 'Call the bank')
    expect(manual.isDone).toBe(false)
    expect(manual.id).not.toBe('c1')
    // The stale auto item is NOT copied; a fresh auto transfer to-do is regenerated.
    expect(copy.checklist.filter((c) => c.isAuto && /Transfer/.test(c.label) && c.accountId === 'accB')).toHaveLength(1)
    expect(copy.checklist.some((c) => c.accountId === 'inv:mf')).toBe(true)
    expect(copy.checklist.every((c) => c.isDone === false)).toBe(true)
  })

  it('respects a currency override', () => {
    expect(buildMonthCopy(source, '2026-08', 'USD', {}).currency).toBe('USD')
  })

  it('round-trips through monthSchema (every field present/typed — no silent defaults)', () => {
    const readback = monthSchema.parse(copy)
    expect(readback.copiedFrom).toBe('2026-06')
    expect(readback.surplus[0].targetFundId).toBe('h1')
    expect(readback.investments.mf).toHaveLength(1)
  })

  it('handles an empty source month → a valid empty seed', () => {
    const empty = buildMonthCopy({ month: '2026-06', currency: 'INR' }, '2026-09', 'INR', {})
    expect(empty.fixedExpenses).toEqual([])
    expect(empty.flow.allocations).toEqual([])
    expect(empty.investments.holdingsFrozen).toBe(true)
    expect(() => monthSchema.parse(empty)).not.toThrow()
  })

  it('freezes holdings from the live registry when the source never froze a snapshot', () => {
    const legacy = { ...source, investments: { mf: [], stocks: [], holdings: [], holdingsFrozen: false } }
    const registry = [
      { id: 'h9', kind: 'mutualFund', name: 'Reg F', bucket: 'x', active: true, archived: false },
      { id: 'h8', kind: 'mutualFund', name: 'Gone F', bucket: 'x', active: true, archived: true },
    ]
    const out = buildMonthCopy(legacy, '2026-08', 'INR', {}, registry)
    expect(out.investments.holdings).toEqual([{ id: 'h9', kind: 'mutualFund', name: 'Reg F', bucket: 'x', active: true }])
    expect(out.investments.holdingsFrozen).toBe(true)
  })
})
