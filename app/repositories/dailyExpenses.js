// Daily expenses repository (§6). expenseId = UUID; stamps the month's currency.
import { getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { userCollection, userDoc, makeConverter } from './base.js'
import { newId } from '~/domain/ids.js'
import { dailyExpenseSchema, dailyExpenseInputSchema } from '~/domain/schemas.js'

const conv = makeConverter(dailyExpenseSchema, (id, raw) => ({ ...raw, id: raw.id ?? id }))
const col = (uid, monthId) => userCollection(uid, 'months', monthId, 'dailyExpenses').withConverter(conv)
const ref = (uid, monthId, id) => userDoc(uid, 'months', monthId, 'dailyExpenses', id).withConverter(conv)

export const dailyExpensesRepo = {
  /** Newest date first. @param {string} uid @param {string} monthId */
  async list(uid, monthId) {
    const snap = await getDocs(query(col(uid, monthId), orderBy('date', 'desc')))
    return snap.docs.map((d) => d.data())
  },

  /** @returns {() => void} unsubscribe */
  subscribe(uid, monthId, cb, onErr) {
    return onSnapshot(query(col(uid, monthId), orderBy('date', 'desc')), (snap) => {
      cb(snap.docs.map((d) => d.data()))
    }, (e) => onErr?.(e))
  },

  /**
   * Add an expense with a client UUID, stamped with the month's currency.
   * @param {string} uid @param {string} monthId
   * @param {object} input { date, item, amount, note?, category }
   * @param {string} currency the month's stamped currency
   */
  async add(uid, monthId, input, currency) {
    const body = dailyExpenseInputSchema.parse(input)
    const id = newId()
    const expense = { id, currency, ...body }
    await setDoc(ref(uid, monthId, id), { ...expense, createdAt: serverTimestamp() })
    return expense
  },

  async update(uid, monthId, id, patch) {
    const body = dailyExpenseInputSchema.partial().parse(patch)
    await updateDoc(userDoc(uid, 'months', monthId, 'dailyExpenses', id), body)
  },

  async remove(uid, monthId, id) {
    await deleteDoc(userDoc(uid, 'months', monthId, 'dailyExpenses', id))
  },
}
