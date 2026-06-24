// Plan versions repository (§6) — immutable, append-only history.
// users/{uid}/plans/{type}/versions/{versionId}. Mints UUID; stamps currency.
import { getDocs, getDoc, setDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { userCollection, userDoc, makeConverter } from './base.js'
import { newId } from '~/domain/ids.js'
import { monthlyVersionSchema, yearlyVersionSchema, monthlyVersionBodySchema, yearlyVersionBodySchema } from '~/domain/schemas.js'
import { settingsRepo } from './settings.js'

const schemaFor = (type) => (type === 'yearly' ? yearlyVersionSchema : monthlyVersionSchema)
const bodySchemaFor = (type) => (type === 'yearly' ? yearlyVersionBodySchema : monthlyVersionBodySchema)

const convFor = (type) => makeConverter(schemaFor(type), (id, raw) => ({ ...raw, id: raw.id ?? id }))
const col = (uid, type) => userCollection(uid, 'plans', type, 'versions').withConverter(convFor(type))
const ref = (uid, type, id) => userDoc(uid, 'plans', type, 'versions', id).withConverter(convFor(type))

export const planVersionsRepo = {
  /** Newest-first history. @param {string} uid @param {'monthly'|'yearly'} type */
  async list(uid, type) {
    const snap = await getDocs(query(col(uid, type), orderBy('createdAt', 'desc')))
    return snap.docs.map((d) => d.data())
  },

  /** @returns {() => void} unsubscribe */
  subscribe(uid, type, cb, onErr) {
    return onSnapshot(query(col(uid, type), orderBy('createdAt', 'desc')), (snap) => {
      cb(snap.docs.map((d) => d.data()))
    }, (e) => onErr?.(e))
  },

  async get(uid, type, id) {
    if (!id) return null
    const snap = await getDoc(ref(uid, type, id))
    return snap.exists() ? snap.data() : null
  },

  /**
   * Append a new immutable version. Mints a UUID and stamps the currency
   * (body.currency ?? user default). Returns the created version.
   * @param {string} uid
   * @param {'monthly'|'yearly'} type
   * @param {object} body validated wizard body
   */
  async createVersion(uid, type, body) {
    const parsed = bodySchemaFor(type).parse(body)
    const id = newId()
    const currency = body.currency ?? (await settingsRepo.get(uid))?.currency
    if (!currency) throw new Error('No currency available to stamp the plan version')
    const version = { id, currency, ...parsed }
    await setDoc(ref(uid, type, id), { ...version, createdAt: serverTimestamp() })
    return version
  },
}
