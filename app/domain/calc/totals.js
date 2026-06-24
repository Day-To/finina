// Totals, surplus and source-resolution (§5). Currency-agnostic: every function
// operates on integer minor units within one document's single currency.

import { sumMinor } from '../money.js'

/** @param {object} body @returns {number} */
export function totalFixed(body) {
  return sumMinor((body?.fixedExpenses ?? []).map((l) => l.amount))
}

/** @param {object} body @returns {number} */
export function totalVariable(body) {
  return sumMinor((body?.variableExpenses ?? []).map((l) => l.amount))
}

/** @param {object} body @returns {number} */
export function totalExpenses(body) {
  return totalFixed(body) + totalVariable(body)
}

/** income − totalExpenses; can be ≤ 0. @param {object} body @returns {number} */
export function surplus(body) {
  return (body?.income ?? 0) - totalExpenses(body)
}

/**
 * Resolve each surplus line to a concrete minor-unit amount.
 * PCT → round(pool * value / 100); AMOUNT → value. The pool is clamped at 0
 * (a negative surplus yields 0 for PCT lines; AMOUNT lines keep their value).
 * @param {object} body
 * @returns {Array<{id:string,item:string,mode:string,value:number,order:number,amount:number}>}
 */
export function surplusAmounts(body) {
  const pool = Math.max(0, surplus(body))
  return (body?.surplus ?? []).map((line) => {
    const v = Number(line.value) || 0
    const amount = line.mode === 'PCT' ? Math.round((pool * v) / 100) : Math.round(v)
    return { ...line, amount }
  })
}

/**
 * Total percentage assigned by PCT surplus lines (for the 100% warning).
 * @param {object} body @returns {number}
 */
export function surplusPctAssigned(body) {
  return (body?.surplus ?? [])
    .filter((l) => l.mode === 'PCT')
    .reduce((sum, l) => sum + (Number(l.value) || 0), 0)
}

/**
 * Map of every allocatable source line (fixed + variable + resolved surplus)
 * id → minor-unit amount. Built once and reused by flow calculations.
 * @param {object} body
 * @returns {Map<string, number>}
 */
export function sourceAmountMap(body) {
  const m = new Map()
  for (const l of body?.fixedExpenses ?? []) m.set(l.id, (m.get(l.id) ?? 0) + (l.amount ?? 0))
  for (const l of body?.variableExpenses ?? []) m.set(l.id, (m.get(l.id) ?? 0) + (l.amount ?? 0))
  // Every surplus line (incl. investment-routed ones) is real money that moves
  // through a bank account — income → account → fund — so it stays a flow source.
  // The Investments block is a downstream view of the routed pools, not a separate
  // outflow, so this is not a double-count.
  for (const s of surplusAmounts(body)) m.set(s.id, (m.get(s.id) ?? 0) + (s.amount ?? 0))
  return m
}

/**
 * Minor-unit amount of a single source line by id (0 if unknown).
 * @param {object} body
 * @param {string} sourceId
 * @returns {number}
 */
export function resolveSourceById(body, sourceId) {
  return sourceAmountMap(body).get(sourceId) ?? 0
}
