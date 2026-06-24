// Money-flow → accounts: per-account transfer sums, reconciliation, and the
// auto-generated transfer to-dos (§5, S5.5).

import { newId } from '../ids.js'
import { formatMoney } from '../money.js'
import { sourceAmountMap } from './totals.js'

/**
 * Sum each allocation's source amounts by destination account.
 * @param {object} body
 * @returns {Map<string, number>} accountId → minor units
 */
export function accountTransfers(body) {
  const amounts = sourceAmountMap(body)
  const transfers = new Map()
  for (const alloc of body?.flow?.allocations ?? []) {
    let sum = 0
    for (const sid of alloc.sourceIds ?? []) sum += amounts.get(sid) ?? 0
    transfers.set(alloc.accountId, (transfers.get(alloc.accountId) ?? 0) + sum)
  }
  return transfers
}

/**
 * Reconcile the flow: are all source lines assigned to an account, and do any
 * allocations reference lines that no longer exist?
 * @param {object} body
 * @returns {{balanced:boolean, unassignedIds:string[], orphanSourceIds:string[], diff:number, totalSources:number, totalAssigned:number}}
 */
export function reconcile(body) {
  const amounts = sourceAmountMap(body)
  const allIds = [...amounts.keys()]
  const totalSources = [...amounts.values()].reduce((a, b) => a + b, 0)

  const assigned = new Set()
  const orphanSourceIds = []
  for (const alloc of body?.flow?.allocations ?? []) {
    for (const sid of alloc.sourceIds ?? []) {
      if (amounts.has(sid)) assigned.add(sid)
      else orphanSourceIds.push(sid)
    }
  }

  const unassignedIds = allIds.filter((id) => !assigned.has(id))
  let totalAssigned = 0
  for (const id of assigned) totalAssigned += amounts.get(id) ?? 0

  return {
    balanced: unassignedIds.length === 0 && orphanSourceIds.length === 0,
    unassignedIds,
    orphanSourceIds,
    diff: totalSources - totalAssigned,
    totalSources,
    totalAssigned,
  }
}

/**
 * Build auto "Transfer X to <account>" to-dos from the flow allocations.
 * @param {object} body
 * @param {string} currency ISO 4217 code (for the formatted amount in the label)
 * @param {Map<string,{name:string}>|Object<string,{name:string}>} [accountsById] optional name lookup
 * @returns {Array<{id:string,label:string,isAuto:boolean,order:number}>}
 */
export function autoTransferTodos(body, currency, accountsById) {
  const nameOf = (id) => {
    if (!accountsById) return null
    const a = typeof accountsById.get === 'function' ? accountsById.get(id) : accountsById[id]
    return a?.name ?? null
  }
  const incomeId = body?.flow?.incomeAccountId
  const todos = []
  for (const [accountId, amount] of accountTransfers(body)) {
    // Skip empty transfers and the income account itself (money already lands
    // there — no transfer needed).
    if (amount <= 0 || accountId === incomeId) continue
    const target = nameOf(accountId) ?? 'account'
    todos.push({
      id: newId(),
      label: `Transfer ${formatMoney(amount, currency)} to ${target}`,
      isAuto: true,
      accountId, // stable key for done-state preservation across re-sync
      order: todos.length,
    })
  }
  return todos
}
