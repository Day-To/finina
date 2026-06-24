// Stable identifiers for created records and line items (§4 ID strategy).
// Client-generated UUIDs enable optimistic/idempotent writes (setDoc, not addDoc)
// and stable references that survive edits (flow maps account -> line-item ids).

/**
 * Generate a new UUID v4 string.
 * Uses the built-in crypto.randomUUID() (available in secure contexts / modern
 * runtimes). Falls back to a manual RFC4122-ish generator only if unavailable.
 * @returns {string}
 */
export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback (non-secure contexts / old runtimes). Not cryptographically strong.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
