import { describe, it, expect } from 'vitest'
import { accountTransfers, reconcile, autoTransferTodos } from './flow.js'

const body = {
  income: 100000,
  fixedExpenses: [
    { id: 'f1', amount: 40000 },
    { id: 'f2', amount: 10000 },
  ],
  variableExpenses: [{ id: 'v1', amount: 20000 }],
  surplus: [{ id: 's1', mode: 'PCT', value: 100 }], // pool 30000 -> 30000
  flow: {
    incomeAccountId: 'accA',
    allocations: [
      { accountId: 'accA', sourceIds: ['f1', 's1'] },
      { accountId: 'accB', sourceIds: ['f2', 'v1'] },
    ],
  },
}

describe('accountTransfers', () => {
  it('sums each allocation by destination account', () => {
    const t = accountTransfers(body)
    expect(t.get('accA')).toBe(70000) // 40000 + 30000
    expect(t.get('accB')).toBe(30000) // 10000 + 20000
  })
})

describe('reconcile', () => {
  it('is balanced when every source is assigned', () => {
    const r = reconcile(body)
    expect(r.balanced).toBe(true)
    expect(r.unassignedIds).toEqual([])
    expect(r.diff).toBe(0)
  })
  it('flags unassigned sources', () => {
    const partial = { ...body, flow: { incomeAccountId: 'accA', allocations: [{ accountId: 'accA', sourceIds: ['f1'] }] } }
    const r = reconcile(partial)
    expect(r.balanced).toBe(false)
    expect(r.unassignedIds.sort()).toEqual(['f2', 's1', 'v1'])
    expect(r.diff).toBe(60000) // 10000 + 20000 + 30000
  })
  it('flags orphan references to deleted lines', () => {
    const orphan = { ...body, flow: { incomeAccountId: 'accA', allocations: [{ accountId: 'accA', sourceIds: ['f1', 'f2', 'v1', 's1', 'ghost'] }] } }
    const r = reconcile(orphan)
    expect(r.orphanSourceIds).toContain('ghost')
    expect(r.balanced).toBe(false)
  })
})

describe('autoTransferTodos', () => {
  // body.flow.incomeAccountId === 'accA', so accA is excluded (income lands there).
  it('builds one labelled to-do per NON-income account that receives a transfer', () => {
    const todos = autoTransferTodos(body, 'INR', { accA: { name: 'HDFC' }, accB: { name: 'ICICI' } })
    expect(todos).toHaveLength(1)
    expect(todos[0].accountId).toBe('accB')
    expect(todos[0].isAuto).toBe(true)
    expect(todos[0].label).toContain('ICICI')
  })
  it('skips zero-amount accounts and supports a Map lookup', () => {
    const map = new Map([['accA', { name: 'HDFC' }], ['accB', { name: 'ICICI' }]])
    const todos = autoTransferTodos(body, 'INR', map)
    expect(todos.every((t) => /Transfer/.test(t.label))).toBe(true)
  })
  it('carries a stable accountId key and excludes the income account', () => {
    const todos = autoTransferTodos(body, 'INR')
    expect(todos.map((t) => t.accountId)).toEqual(['accB'])
  })
})
