// Bank accounts repository (§6). accountId = UUID; no amounts (no currency).
import { getDocs, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { userCollection, userDoc, makeConverter } from './base.js'
import { newId } from '~/domain/ids.js'
import { bankAccountSchema, bankAccountInputSchema } from '~/domain/schemas.js'

const conv = makeConverter(bankAccountSchema, (id, raw) => ({ ...raw, id: raw.id ?? id }))

const col = (uid) => userCollection(uid, 'bankAccounts').withConverter(conv)
const ref = (uid, id) => userDoc(uid, 'bankAccounts', id).withConverter(conv)

export const bankAccountsRepo = {
  /** @param {string} uid */
  async list(uid) {
    const snap = await getDocs(query(col(uid), orderBy('name')))
    return snap.docs.map((d) => d.data())
  },

  /** @returns {() => void} unsubscribe */
  subscribe(uid, cb, onErr) {
    return onSnapshot(query(col(uid), orderBy('name')), (snap) => {
      cb(snap.docs.map((d) => d.data()))
    }, (e) => onErr?.(e))
  },

  async get(uid, id) {
    const snap = await getDoc(ref(uid, id))
    return snap.exists() ? snap.data() : null
  },

  /**
   * Create an account with a client-generated UUID (idempotent setDoc).
   * @returns {Promise<object>} the created account
   */
  async create(uid, input) {
    const body = bankAccountInputSchema.parse(input)
    const id = newId()
    const account = { id, ...body }
    await setDoc(ref(uid, id), { ...account, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    return account
  },

  async update(uid, id, patch) {
    const body = bankAccountInputSchema.partial().parse(patch)
    await updateDoc(userDoc(uid, 'bankAccounts', id), { ...body, updatedAt: serverTimestamp() })
  },

  // Soft-delete: archive (reversible) keeps the account resolvable for past
  // months; purge (permanent) truly removes it.
  async archive(uid, id) {
    await updateDoc(userDoc(uid, 'bankAccounts', id), { archived: true, archivedAt: serverTimestamp() })
  },

  async restore(uid, id) {
    await updateDoc(userDoc(uid, 'bankAccounts', id), { archived: false, archivedAt: null })
  },

  async purge(uid, id) {
    await deleteDoc(userDoc(uid, 'bankAccounts', id))
  },
}
