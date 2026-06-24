// Plan singleton repository (§6). planId = "monthly" | "yearly".
import { getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { userDoc, makeConverter } from './base.js'
import { planSchema } from '~/domain/schemas.js'

const conv = makeConverter(planSchema, (id, raw) => ({ ...raw, type: raw.type ?? id }))
const ref = (uid, type) => userDoc(uid, 'plans', type).withConverter(conv)

export const plansRepo = {
  /** @param {string} uid @param {'monthly'|'yearly'} type */
  async get(uid, type) {
    const snap = await getDoc(ref(uid, type))
    return snap.exists() ? snap.data() : null
  },

  /** @returns {() => void} unsubscribe */
  subscribe(uid, type, cb, onErr) {
    return onSnapshot(ref(uid, type), (snap) => cb(snap.exists() ? snap.data() : null), (e) => onErr?.(e))
  },

  /** Create the plan doc if it doesn't exist yet (no active version). */
  async ensure(uid, type) {
    const existing = await this.get(uid, type)
    if (existing) return existing
    await setDoc(ref(uid, type), { type, activeVersionId: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    return { type, activeVersionId: null }
  },

  /** Point the plan at a (new) active version — used by save & revert. */
  async setActiveVersion(uid, type, versionId) {
    await setDoc(
      userDoc(uid, 'plans', type),
      { type, activeVersionId: versionId, updatedAt: serverTimestamp() },
      { merge: true },
    )
  },
}
