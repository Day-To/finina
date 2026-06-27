// Reusable investment routing plan — a POINTER doc + append-only version history,
// mirroring plans.js + planVersions.js.
//   users/{uid}/investmentPlan/plan                 → { activeVersionId }
//   users/{uid}/investmentPlan/plan/versions/{id}   → { id, mfRouting, stockRouting, label }
import { getDoc, getDocs, setDoc, onSnapshot, query, orderBy, serverTimestamp, writeBatch } from 'firebase/firestore'
import { userDoc, userCollection, makeConverter, db } from './base.js'
import { newId } from '~/domain/ids.js'
import { investmentPlanSchema, investmentPlanVersionSchema } from '~/domain/schemas.js'

const ptrConv = makeConverter(investmentPlanSchema)
const ptrRef = (uid) => userDoc(uid, 'investmentPlan', 'plan').withConverter(ptrConv)
const verConv = makeConverter(investmentPlanVersionSchema, (id, raw) => ({ ...raw, id: raw.id ?? id }))
const verCol = (uid) => userCollection(uid, 'investmentPlan', 'plan', 'versions').withConverter(verConv)
const verRef = (uid, id) => userDoc(uid, 'investmentPlan', 'plan', 'versions', id).withConverter(verConv)

const emptyPtr = () => ({ activeVersionId: null })

export const investmentPlanRepo = {
  // ── Pointer ──────────────────────────────────────────────────────────────
  async get(uid) {
    const s = await getDoc(ptrRef(uid))
    return s.exists() ? s.data() : emptyPtr()
  },

  /** Raw pointer, or null when the doc doesn't exist (for exact-fidelity export). */
  async getRaw(uid) {
    const s = await getDoc(ptrRef(uid))
    return s.exists() ? s.data() : null
  },

  /** @returns {() => void} unsubscribe */
  subscribe(uid, cb, onErr) {
    return onSnapshot(ptrRef(uid), (s) => cb(s.exists() ? s.data() : emptyPtr()), (e) => onErr?.(e))
  },

  async setActiveVersion(uid, versionId) {
    await setDoc(ptrRef(uid), { activeVersionId: versionId, updatedAt: serverTimestamp() }, { merge: true })
  },

  // ── Versions (append-only) ─────────────────────────────────────────────────
  async listVersions(uid) {
    const s = await getDocs(query(verCol(uid), orderBy('createdAt', 'desc')))
    return s.docs.map((d) => d.data())
  },

  /** @returns {() => void} unsubscribe */
  subscribeVersions(uid, cb, onErr) {
    return onSnapshot(query(verCol(uid), orderBy('createdAt', 'desc')), (s) => cb(s.docs.map((d) => d.data())), (e) => onErr?.(e))
  },

  async getVersion(uid, id) {
    if (!id) return null
    const s = await getDoc(verRef(uid, id))
    return s.exists() ? s.data() : null
  },

  /** Append a new immutable version (mints a UUID). */
  async createVersion(uid, { mfRouting, stockRouting, label, basedOn } = {}) {
    const id = newId()
    const version = { id, mfRouting: mfRouting ?? [], stockRouting: stockRouting ?? [], label: label ?? '', ...(basedOn ? { basedOn } : {}) }
    await setDoc(verRef(uid, id), { ...version, createdAt: serverTimestamp() })
    return version
  },

  /**
   * Append a new version AND point the plan at it, atomically (one batch — so a
   * partial write can never leave an orphan version or a stale active pointer).
   */
  async saveRouting(uid, { mfRouting, stockRouting, label, basedOn } = {}) {
    const id = newId()
    const version = { id, mfRouting: mfRouting ?? [], stockRouting: stockRouting ?? [], label: label ?? '', ...(basedOn ? { basedOn } : {}) }
    const batch = writeBatch(db())
    batch.set(verRef(uid, id), { ...version, createdAt: serverTimestamp() })
    batch.set(ptrRef(uid), { activeVersionId: id, updatedAt: serverTimestamp() }, { merge: true })
    await batch.commit()
    return version
  },

  /**
   * The active version's routing — for materialize and any consumer that just
   * needs the current routing. Falls back to legacy singleton routing when the
   * plan hasn't been versioned yet.
   */
  async getActive(uid) {
    const ptr = await this.get(uid)
    if (ptr.activeVersionId) {
      const v = await this.getVersion(uid, ptr.activeVersionId)
      if (v) return { mfRouting: v.mfRouting ?? [], stockRouting: v.stockRouting ?? [] }
    }
    return { mfRouting: ptr.mfRouting ?? [], stockRouting: ptr.stockRouting ?? [] }
  },
}
