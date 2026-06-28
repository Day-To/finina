// Per-uid abuse/cost quota for the AI copilot.
//
// State lives in a TOP-LEVEL `copilotUsage/{uid}` doc — deliberately OUTSIDE the
// owner-writable `users/{uid}/**` subtree — so the authenticated user it bounds
// cannot reset their own counter via the client SDK. Only the Admin SDK (which
// bypasses Security Rules) reads/writes it; firestore.rules denies all client
// access to /copilotUsage/{uid}.
import { adminDb } from './firebaseAdmin.js'

const PER_MIN = Number(process.env.COPILOT_MAX_PER_MIN || 8)
const PER_DAY = Number(process.env.COPILOT_MAX_PER_DAY || 120)

export class QuotaError extends Error {
  constructor(message) {
    super(message)
    this.name = 'QuotaError'
    this.statusCode = 429
  }
}

/**
 * Atomically increment the caller's rolling minute+day counters and throw a
 * QuotaError (429) when either limit is exceeded. Create-on-first-use.
 * @param {string} uid verified user id
 */
export async function assertWithinQuota(uid) {
  const ref = adminDb().doc(`copilotUsage/${uid}`)
  const now = Date.now()
  const minuteWindow = Math.floor(now / 60000)
  const dayWindow = Math.floor(now / 86400000)

  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const d = snap.exists ? snap.data() : null
    const minuteCount = d?.minuteWindow === minuteWindow ? (d.minuteCount || 0) : 0
    const dayCount = d?.dayWindow === dayWindow ? (d.dayCount || 0) : 0
    if (minuteCount >= PER_MIN) throw new QuotaError('Too many requests this minute. Please slow down.')
    if (dayCount >= PER_DAY) throw new QuotaError('Daily copilot limit reached. Please try again tomorrow.')
    tx.set(ref, {
      minuteWindow, minuteCount: minuteCount + 1,
      dayWindow, dayCount: dayCount + 1,
      updatedAt: now,
    }, { merge: true })
  })
}
