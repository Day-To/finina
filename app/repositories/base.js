// Data-access base helpers (§6). This is the ONLY layer that knows Firestore.
// Repositories mint UUIDs, stamp currency, validate via Zod converters, and
// return entity-shaped objects — callers never see a DocumentSnapshot.

import { doc, collection } from 'firebase/firestore'

/**
 * The Firestore instance provided by plugins/firebase.client.js.
 * Safe to call from composables/components and their event handlers (Nuxt
 * keeps the app context available).
 * @returns {import('firebase/firestore').Firestore}
 */
export function db() {
  const { $db } = useNuxtApp()
  if (!$db) throw new Error('Firestore is not initialized ($db missing)')
  return $db
}

/** users/{uid} */
export function userDocRef(uid) {
  return doc(db(), 'users', uid)
}

/** users/{uid}/{...segments} document ref */
export function userDoc(uid, ...segments) {
  return doc(db(), 'users', uid, ...segments)
}

/** users/{uid}/{collectionPath...} collection ref */
export function userCollection(uid, ...segments) {
  return collection(db(), 'users', uid, ...segments)
}

/**
 * Build a Firestore converter from a Zod schema. Validation happens on READ
 * (the Firestore boundary); writes pass through untouched so serverTimestamp()
 * sentinels survive. A doc that fails validation is returned best-effort (with
 * a warning) so one malformed record never blanks the whole screen.
 * @param {import('zod').ZodType} schema
 * @param {(snapId:string, raw:object)=>object} [hydrate] merge extra fields (e.g. id from doc id) before parsing
 */
export function makeConverter(schema, hydrate) {
  return {
    toFirestore(data) {
      // Strip any client-only undefineds; Firestore rejects undefined values.
      return stripUndefined(data)
    },
    fromFirestore(snapshot, options) {
      const raw = snapshot.data(options) ?? {}
      const merged = hydrate ? hydrate(snapshot.id, raw) : raw
      const result = schema.safeParse(merged)
      if (result.success) return result.data
      console.warn(`[repo] validation failed for ${snapshot.ref.path}:`, result.error?.issues)
      // Best-effort: layer the stored data over the schema's defaults so missing
      // array/object fields (flow/surplus/checklist/…) are still normalized and
      // never reach the UI as undefined.
      const defaults = schema.safeParse({})
      return defaults.success ? { ...defaults.data, ...merged } : merged
    },
  }
}

/**
 * Recursively remove `undefined` values (Firestore rejects them). Keeps nulls.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined)
  if (value && typeof value === 'object' && !isFirestoreSentinel(value)) {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue
      out[k] = stripUndefined(v)
    }
    return out
  }
  return value
}

// FieldValue sentinels (serverTimestamp, etc.) and Timestamps must pass through
// untouched — don't iterate their internals.
function isFirestoreSentinel(v) {
  const name = v?.constructor?.name
  return name === 'Timestamp' || name === 'FieldValueImpl' || name === 'FieldValue' || typeof v?.toDate === 'function'
}
