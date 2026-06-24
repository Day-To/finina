// User settings repository (§6). Settings live on the users/{uid} doc.
import { getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { userDocRef } from './base.js'
import { userSettingsSchema } from '~/domain/schemas.js'
import { DEFAULT_CURRENCY } from '~/domain/currencies.js'

function parse(raw) {
  const r = userSettingsSchema.safeParse(raw)
  return r.success ? r.data : null
}

export const settingsRepo = {
  /**
   * Fetch settings once. Returns null if the user doc / currency isn't set yet.
   * @param {string} uid
   */
  async get(uid) {
    const snap = await getDoc(userDocRef(uid))
    if (!snap.exists()) return null
    return parse(snap.data())
  },

  /**
   * Reactive subscription. Calls cb(settings|null) on every change.
   * @returns {() => void} unsubscribe
   */
  subscribe(uid, cb, onErr) {
    return onSnapshot(userDocRef(uid), (snap) => {
      cb(snap.exists() ? parse(snap.data()) : null)
    }, (e) => onErr?.(e))
  },

  /**
   * Create settings (first-run onboarding). Merges so we never clobber the doc.
   * @param {string} uid
   * @param {{currency?:string, locale?:string}} input
   */
  async create(uid, input = {}) {
    const currency = input.currency ?? DEFAULT_CURRENCY
    const payload = { currency, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
    // Only write locale when actually provided — never persist an explicit null.
    if (input.locale != null) payload.locale = input.locale
    await setDoc(userDocRef(uid), payload, { merge: true })
    return { currency, locale: input.locale ?? null }
  },

  /**
   * Update the default currency / locale (default for NEW records only — never
   * retroactively reinterprets existing stamped docs).
   * @param {string} uid
   * @param {{currency?:string, locale?:string}} patch
   */
  async update(uid, patch) {
    await setDoc(userDocRef(uid), { ...patch, updatedAt: serverTimestamp() }, { merge: true })
  },
}
