// Home dashboard analysis — month-on-month series (§5, S1).
// Assumes a consistent currency across months in v1.

import { totalExpenses, surplus } from './totals.js'

/**
 * Build a chronological month-on-month series with simple deltas.
 * @param {object[]} months array of Month docs
 * @returns {{series:Array<{month:string,income:number,expenses:number,surplus:number,incomeDelta:number|null,expensesDelta:number|null}>, latest:object|null, totals:{income:number,expenses:number,surplus:number}}}
 */
export function homeAnalysis(months) {
  const sorted = [...(months ?? [])].sort((a, b) =>
    a.month < b.month ? -1 : a.month > b.month ? 1 : 0,
  )

  const base = sorted.map((m) => ({
    month: m.month,
    income: m.income ?? 0,
    expenses: totalExpenses(m),
    surplus: surplus(m),
  }))

  const pctDelta = (cur, prev) => (prev ? (cur - prev) / Math.abs(prev) : null)

  const series = base.map((s, i) => {
    const prev = base[i - 1]
    return {
      ...s,
      incomeDelta: prev ? pctDelta(s.income, prev.income) : null,
      expensesDelta: prev ? pctDelta(s.expenses, prev.expenses) : null,
    }
  })

  const totals = base.reduce(
    (acc, s) => ({
      income: acc.income + s.income,
      expenses: acc.expenses + s.expenses,
      surplus: acc.surplus + s.surplus,
    }),
    { income: 0, expenses: 0, surplus: 0 },
  )

  return { series, latest: series[series.length - 1] ?? null, totals }
}
