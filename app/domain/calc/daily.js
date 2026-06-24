// Daily budget vs spend (§5, S9).

import { sumMinor } from '../money.js'

/**
 * Calendar days in a "YYYY-MM" period.
 * @param {string} monthId
 * @returns {number}
 */
export function daysInMonth(monthId) {
  const [y, m] = String(monthId || '').split('-').map(Number)
  if (!y || !m) return 30
  return new Date(y, m, 0).getDate()
}

/**
 * The month's daily-budget pool: sum of variable expenses flagged isDailyBudget.
 * @param {object} month
 * @returns {number} minor units
 */
export function dailyBudget(month) {
  return sumMinor((month?.variableExpenses ?? []).filter((v) => v.isDailyBudget).map((v) => v.amount))
}

/**
 * Budget vs spent for the month. remaining can be negative (over budget).
 * @param {object} month
 * @param {Array<{amount:number}>} dailies
 * @returns {{budget:number, spent:number, remaining:number, daysInMonth:number, perDay:number, count:number}}
 */
export function dailySummary(month, dailies) {
  const budget = dailyBudget(month)
  const list = dailies ?? []
  const spent = sumMinor(list.map((d) => d.amount))
  const days = daysInMonth(month?.month)
  return {
    budget,
    spent,
    remaining: budget - spent,
    daysInMonth: days,
    perDay: days ? Math.round(budget / days) : 0,
    count: list.length,
  }
}

/**
 * Group daily expenses by their date string, newest date first, preserving
 * within-day order as given (callers sort by createdAt/date desc upstream).
 * @param {Array<{date:string}>} dailies
 * @returns {Array<{date:string, items:object[], total:number}>}
 */
export function groupByDate(dailies) {
  const map = new Map()
  for (const d of dailies ?? []) {
    if (!map.has(d.date)) map.set(d.date, [])
    map.get(d.date).push(d)
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, items]) => ({ date, items, total: sumMinor(items.map((i) => i.amount)) }))
}
