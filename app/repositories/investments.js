// Investments registry repository (mutual funds + stocks). Mirrors
// bankAccounts.js: Zod-validated converter, client UUIDs, Firestore hidden.
import { getDocs, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { userCollection, userDoc, makeConverter } from './base.js'
import { newId } from '~/domain/ids.js'
import { investmentSchema, investmentInputSchema } from '~/domain/schemas.js'

const conv = makeConverter(investmentSchema, (id, raw) => ({ ...raw, id: raw.id ?? id }))
const col = (uid) => userCollection(uid, 'investments').withConverter(conv)
const ref = (uid, id) => userDoc(uid, 'investments', id).withConverter(conv)

export const investmentsRepo = {
  async list(uid) {
    const snap = await getDocs(query(col(uid), orderBy('name')))
    return snap.docs.map((d) => d.data())
  },

  /** @returns {() => void} unsubscribe */
  subscribe(uid, cb, onErr) {
    return onSnapshot(query(col(uid), orderBy('name')), (snap) => cb(snap.docs.map((d) => d.data())), (e) => onErr?.(e))
  },

  async get(uid, id) {
    const snap = await getDoc(ref(uid, id))
    return snap.exists() ? snap.data() : null
  },

  async create(uid, input) {
    const body = investmentInputSchema.parse(input)
    const id = newId()
    const investment = { id, ...body }
    await setDoc(ref(uid, id), { ...investment, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    return investment
  },

  async update(uid, id, patch) {
    const body = investmentInputSchema.partial().parse(patch)
    await updateDoc(userDoc(uid, 'investments', id), { ...body, updatedAt: serverTimestamp() })
  },

  // Soft-delete: archive (reversible) keeps the holding resolvable for past
  // months; purge (permanent) truly removes it. Distinct from `active` (paused).
  async archive(uid, id) {
    await updateDoc(userDoc(uid, 'investments', id), { archived: true, archivedAt: serverTimestamp() })
  },

  async restore(uid, id) {
    await updateDoc(userDoc(uid, 'investments', id), { archived: false, archivedAt: null })
  },

  async purge(uid, id) {
    await deleteDoc(userDoc(uid, 'investments', id))
  },
}
