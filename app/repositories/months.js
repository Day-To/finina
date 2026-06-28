// Months repository (§6). monthId = "YYYY-MM" (natural key).
import { getDoc, getDocs, setDoc, onSnapshot, query, orderBy, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db, userCollection, userDoc, makeConverter } from './base.js'
import { monthSchema } from '~/domain/schemas.js'

const conv = makeConverter(monthSchema, (id, raw) => ({ ...raw, month: raw.month ?? id }))
const col = (uid) => userCollection(uid, 'months').withConverter(conv)
const ref = (uid, monthId) => userDoc(uid, 'months', monthId).withConverter(conv)

export const monthsRepo = {
  async get(uid, monthId) {
    const snap = await getDoc(ref(uid, monthId))
    return snap.exists() ? snap.data() : null
  },

  /** @returns {() => void} unsubscribe */
  subscribe(uid, monthId, cb, onErr) {
    return onSnapshot(ref(uid, monthId), (snap) => cb(snap.exists() ? snap.data() : null), (e) => onErr?.(e))
  },

  /** All months, newest period first. */
  async list(uid) {
    const snap = await getDocs(query(col(uid), orderBy('month', 'desc')))
    return snap.docs.map((d) => d.data())
  },

  /** @returns {() => void} unsubscribe */
  subscribeList(uid, cb, onErr) {
    return onSnapshot(query(col(uid), orderBy('month', 'desc')), (snap) => {
      cb(snap.docs.map((d) => d.data()))
    }, (e) => onErr?.(e))
  },

  /**
   * Create-or-update a month (materialize or save edits). Preserves createdAt
   * when present; stamps it on first write.
   * @param {string} uid @param {string} monthId @param {object} data full Month
   */
  async upsert(uid, monthId, data) {
    const payload = { ...data, month: monthId, updatedAt: serverTimestamp() }
    if (!payload.createdAt) payload.createdAt = serverTimestamp()
    await setDoc(ref(uid, monthId), payload, { merge: true })
  },

  /**
   * Delete a month AND its dailyExpenses subcollection. Firestore doesn't cascade
   * deletes to subcollections, so we clear them in the same atomic batch — otherwise
   * orphaned daily expenses linger (and resurface if the month id is recreated).
   * A month holds at most ~31×N daily rows, well under the 500-op batch limit.
   */
  async remove(uid, monthId) {
    const batch = writeBatch(db())
    const daily = await getDocs(userCollection(uid, 'months', monthId, 'dailyExpenses'))
    daily.forEach((d) => batch.delete(d.ref))
    batch.delete(userDoc(uid, 'months', monthId))
    await batch.commit()
  },

  /**
   * Count how many materialized months reference each bank account / investment
   * holding (by id). Stateless full scan — call behind a user-opened dialog.
   * @returns {Promise<{ bank: Map<string,number>, inv: Map<string,number> }>}
   */
  async countReferences(uid) {
    const months = await this.list(uid)
    const bank = new Map()
    const inv = new Map()
    for (const m of months) {
      const f = m.flow ?? {}
      const accIds = new Set([f.incomeAccountId, ...(f.allocations ?? []).map((a) => a.accountId)].filter(Boolean))
      for (const id of accIds) bank.set(id, (bank.get(id) ?? 0) + 1)
      const holdIds = new Set((m.investments?.holdings ?? []).map((h) => h.id))
      for (const id of holdIds) inv.set(id, (inv.get(id) ?? 0) + 1)
    }
    return { bank, inv }
  },
}
