import { describe, it, expect } from 'vitest'
import {
  poolNodeId, bucketNodeId, fundNodeId, deriveInvestment, reconcileInvestmentSummary,
  addBucket, addSingleFund, addFundToBucket, setFundPct, setAllocMode, setAllocValue, removeAlloc, detachFund, distributeEvenly,
  buildInvestmentTree,
} from './useInvestmentFlow.js'

const holdings = [
  { id: 'a', name: 'Fund A', bucket: 'long term', kind: 'mutualFund', active: true },
  { id: 'b', name: 'Fund B', bucket: 'long term', kind: 'mutualFund', active: true },
]

describe('id helpers', () => {
  it('scope fund ids by allocation so the same fund under two buckets never collides', () => {
    expect(fundNodeId('alloc1', 'a')).not.toBe(fundNodeId('alloc2', 'a'))
    expect(bucketNodeId('x')).toBe('bk-x')
    expect(poolNodeId('mf')).toBe('pool-mf')
  })
})

describe('lossless mutators', () => {
  it('addBucket / addSingleFund append without touching existing rows', () => {
    const r0 = []
    const r1 = addBucket(r0, 'long term')
    expect(r1).toHaveLength(1)
    expect(r1[0]).toMatchObject({ kind: 'bucket', bucket: 'long term', mode: 'PCT', value: 0, funds: [] })
    const r2 = addSingleFund(r1, 'a')
    expect(r2).toHaveLength(2)
    expect(r2[1]).toMatchObject({ kind: 'fund', fundId: 'a' })
    expect(r2[0]).toBe(r1[0]) // untouched row reference preserved
  })
  it('addFundToBucket / setFundPct keep funds order and are idempotent on insert', () => {
    let r = addBucket([], 'long term')
    const id = r[0].id
    r = addFundToBucket(r, id, 'a')
    r = addFundToBucket(r, id, 'a') // duplicate ignored
    r = addFundToBucket(r, id, 'b')
    expect(r[0].funds.map((f) => f.fundId)).toEqual(['a', 'b'])
    r = setFundPct(r, id, 'a', 60)
    expect(r[0].funds.find((f) => f.fundId === 'a').pct).toBe(60)
    expect(r[0].funds.map((f) => f.fundId)).toEqual(['a', 'b']) // order unchanged
  })
  it('setAllocMode resets value; setAllocValue updates; removeAlloc reindexes; detachFund removes share', () => {
    let r = addBucket([], 'x')
    const id = r[0].id
    r = setAllocValue(r, id, 50)
    expect(r[0].value).toBe(50)
    r = setAllocMode(r, id, 'AMOUNT')
    expect(r[0]).toMatchObject({ mode: 'AMOUNT', value: 0 })
    r = addFundToBucket(r, id, 'a')
    r = detachFund(r, id, 'a')
    expect(r[0].funds).toHaveLength(0)
    r = removeAlloc(r, id)
    expect(r).toHaveLength(0)
  })
  it('distributeEvenly sets equal pct across the given funds', () => {
    let r = addBucket([], 'long term')
    r = distributeEvenly(r, r[0].id, ['a', 'b'])
    expect(r[0].funds).toEqual([{ fundId: 'a', pct: 50 }, { fundId: 'b', pct: 50 }])
  })
})

describe('deriveInvestment / reconcileInvestmentSummary', () => {
  it('is balanced when the whole pool resolves to funds', () => {
    const routing = [{ id: 'lt', kind: 'bucket', bucket: 'long term', mode: 'PCT', value: 100, funds: [] }]
    const d = deriveInvestment(1000, routing, holdings)
    expect(d.balanced).toBe(true)
    expect(reconcileInvestmentSummary(d)).toBe('Routed in full.')
  })
  it('summarizes unrouted funds + invalid fund rows', () => {
    const routing = [{ id: 'f', kind: 'fund', fundId: 'gone', mode: 'PCT', value: 100 }]
    const d = deriveInvestment(1000, routing, holdings)
    expect(d.balanced).toBe(false)
    expect(reconcileInvestmentSummary(d)).toContain('invalid')
  })
})

describe('buildInvestmentTree', () => {
  it('lays out Pool → bucket → fund leaves with route + fund edges carrying amounts', () => {
    const routing = [{ id: 'lt', kind: 'bucket', bucket: 'long term', mode: 'PCT', value: 100, funds: [{ fundId: 'a', pct: 60 }, { fundId: 'b', pct: 40 }] }]
    const { nodes, edges } = buildInvestmentTree({ poolKey: 'mf', pool: 1000, routing, holdings, currency: 'INR' })
    expect(nodes.find((n) => n.id === poolNodeId('mf'))).toBeTruthy()
    expect(nodes.find((n) => n.id === bucketNodeId('lt'))).toBeTruthy()
    expect(nodes.filter((n) => n.type === 'fund')).toHaveLength(2)
    const routeEdge = edges.find((e) => e.id === 'route-lt')
    expect(routeEdge.source).toBe(poolNodeId('mf'))
    expect(routeEdge.style.stroke).toBe('var(--auto)') // route edge blue
    const fundEdge = edges.find((e) => e.id === 'fund-lt-a')
    expect(fundEdge.style.stroke).toBe('var(--positive)') // fund edge green
    expect(fundEdge.label).toContain('60%')
  })
  it('badges a leaf from the live archived/paused Sets without changing its amount', () => {
    const routing = [{ id: 'lt', kind: 'bucket', bucket: 'long term', mode: 'PCT', value: 100, funds: [{ fundId: 'a', pct: 60 }, { fundId: 'b', pct: 40 }] }]
    const base = buildInvestmentTree({ poolKey: 'mf', pool: 1000, routing, holdings, currency: 'INR' })
    const withBadge = buildInvestmentTree({ poolKey: 'mf', pool: 1000, routing, holdings, currency: 'INR', archivedFundIds: new Set(['a']), pausedFundIds: new Set(['b']) })
    const amt = (tree, fid) => tree.nodes.find((n) => n.type === 'fund' && n.data.fundId === fid).data.amount
    // amounts byte-identical with or without the badge sets (frozen split unaffected)
    expect(amt(withBadge, 'a')).toBe(amt(base, 'a'))
    expect(amt(withBadge, 'b')).toBe(amt(base, 'b'))
    const node = (fid) => withBadge.nodes.find((n) => n.type === 'fund' && n.data.fundId === fid).data
    expect(node('a').archived).toBe(true)
    expect(node('a').paused).toBe(false)
    expect(node('b').paused).toBe(true)
    // empty sets → no badges
    const f = base.nodes.find((n) => n.type === 'fund').data
    expect(f.archived).toBe(false)
    expect(f.paused).toBe(false)
  })
  it('lays out a single-fund row as one direct node off the pool', () => {
    const routing = [{ id: 'd', kind: 'fund', fundId: 'a', mode: 'AMOUNT', value: 500 }]
    const { nodes, edges } = buildInvestmentTree({ poolKey: 'mf', pool: 1000, routing, holdings, currency: 'INR' })
    expect(nodes.find((n) => n.id === fundNodeId('d', 'a')).data.parentKind).toBe('pool')
    expect(edges.find((e) => e.id === 'route-d').target).toBe(fundNodeId('d', 'a'))
    expect(edges.find((e) => e.id === 'route-d').label).toContain('fixed')
  })
})
