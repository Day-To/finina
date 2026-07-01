// Reminders/Alerts repository (§6). alertId = UUID. Firestore for the doc; the
// Storage helper handles attachment bytes. fireAdvance is the exactly-once gate
// across tabs + ticks (idempotent via lastFiredOccurrenceMs in a transaction).
import {
  getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp, runTransaction,
} from 'firebase/firestore'
import { userCollection, userDoc, makeConverter, db } from './base.js'
import { storageRepo } from './storage.js'
import { newId } from '~/domain/ids.js'
import { alertSchema, alertInputBase, RECURRENCE_NONE } from '~/domain/schemas.js'
import { firstOccurrence, advanceAfter, nextOccurrence } from '~/domain/calc/recurrence.js'

const conv = makeConverter(alertSchema, (id, raw) => ({ ...raw, id: raw.id ?? id }))
const col = (uid) => userCollection(uid, 'alerts').withConverter(conv)
const ref = (uid, id) => userDoc(uid, 'alerts', id).withConverter(conv)
const plainRef = (uid, id) => userDoc(uid, 'alerts', id) // for transactional raw read/write

// ROUND-2 FIX B2 helper: order-insensitive recurrence equality so a title-only edit
// is not mistaken for a reschedule.
function sameRecurrence(a, b) {
  if (!a || !b) return a === b
  const norm = (r) => JSON.stringify({
    freq: r.freq ?? 'NONE', interval: r.interval ?? 1,
    byWeekday: [...(r.byWeekday ?? [])].sort(),
    byMonthday: [...(r.byMonthday ?? [])].sort((x, y) => x - y),
    byMonth: [...(r.byMonth ?? [])].sort((x, y) => x - y),
    times: [...(r.times ?? [])].sort(),
    endsAt: r.endsAt ?? null, count: r.count ?? null,
  })
  return norm(a) === norm(b)
}

export const alertsRepo = {
  /** Mint an id up-front so the uploader can target the final folder (avoids orphans). */
  newId() { return newId() },

  /** Pure single-field order; client filters archived/enabled/status. @returns {()=>void} */
  subscribe(uid, cb, onErr) {
    return onSnapshot(query(col(uid), orderBy('nextFireAt', 'asc')), (snap) => {
      cb(snap.docs.map((d) => d.data()))
    }, (e) => onErr?.(e))
  },

  async get(uid, id) {
    const snap = await getDoc(ref(uid, id))
    return snap.exists() ? snap.data() : null
  },

  /** Create with a client UUID (optionally a pre-minted id from the uploader). */
  async create(uid, input, presetId) {
    const body = alertInputBase.parse(input)
    const id = presetId || newId()
    const nextFireAt = firstOccurrence(body.recurrence, body.fireAt) // number | null
    const alert = {
      id, ...body,
      status: 'active',
      nextFireAt,                 // explicit number or null — never undefined
      lastFiredOccurrenceMs: null,
      startedCount: 0,
      snoozedUntil: null,
      readAt: null,
      archived: false,
    }
    await setDoc(ref(uid, id), { ...alert, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    return alert
  },

  /** Edit. When fireAt/recurrence change, RESCHEDULE: recompute nextFireAt, reset
   *  the firing state, and clear any in-flight snooze. (PM edge: edit recurring.) */
  async update(uid, id, patch) {
    const body = alertInputBase.partial().parse(patch)
    // ROUND-2 FIX B2: the form always submits fireAt+recurrence, so presence alone can't
    // mean "reschedule" — a title-only edit would otherwise recompute nextFireAt from the
    // (now-past) anchor and fire spuriously. Reschedule ONLY when when/repeat actually
    // changed. Single get() also removes the old double-read.
    const current = await this.get(uid, id)
    const fireAtChanged = body.fireAt != null && (!current || body.fireAt !== current.fireAt)
    const recChanged = body.recurrence != null && (!current || !sameRecurrence(body.recurrence, current.recurrence))
    const extra = {}
    if (fireAtChanged || recChanged) {
      const fireAt = body.fireAt ?? current?.fireAt
      const recurrence = body.recurrence ?? current?.recurrence ?? RECURRENCE_NONE
      extra.nextFireAt = firstOccurrence(recurrence, fireAt)  // number | null
      extra.status = 'active'
      extra.lastFiredOccurrenceMs = null
      extra.startedCount = 0
      extra.snoozedUntil = null
      extra.completedAt = null
    }
    await updateDoc(plainRef(uid, id), { ...body, ...extra, updatedAt: serverTimestamp() })
  },

  /** Explicit reschedule (detail page "edit time"). */
  async reschedule(uid, id, { fireAt, recurrence }) {
    return this.update(uid, id, { fireAt, recurrence })
  },

  /** Snooze the CURRENT occurrence: displace nextFireAt; the grid (anchored at
   *  fireAt) is unaffected, so the regular schedule resumes after it fires. */
  async snooze(uid, id, untilMs) {
    await updateDoc(plainRef(uid, id), {
      nextFireAt: untilMs, snoozedUntil: untilMs, status: 'active', updatedAt: serverTimestamp(),
    })
  },

  /** Mark done — nextFireAt becomes explicit null (kept in the query, sorts first). */
  async complete(uid, id) {
    await updateDoc(plainRef(uid, id), {
      status: 'completed', nextFireAt: null, completedAt: serverTimestamp(),
      snoozedUntil: null, updatedAt: serverTimestamp(),
    })
  },

  /** Re-activate a completed alert from now. */
  async reopen(uid, id) {
    const a = await this.get(uid, id)
    if (!a) return
    // ROUND-4: keep the grid anchored at the ORIGINAL fireAt (consistent weekday/monthday/
    // time-of-day phase); search from max(fireAt, now) so we neither phase-shift the grid nor
    // skip a still-future first fire. (nextOccurrence's afterMs is exclusive → subtract 1 to
    // make it on/after.) NONE fires now (or at a future fireAt).
    const next = (!a.recurrence || a.recurrence.freq === 'NONE')
      ? Math.max(a.fireAt, Date.now())
      : nextOccurrence(a.recurrence, Math.max(a.fireAt, Date.now()) - 1, a.fireAt)
    // ROUND-5: a rule already past its endsAt yields no slot (next == null) → stay completed
    // rather than becoming an invisible active alert with nextFireAt:null.
    await updateDoc(plainRef(uid, id), {
      status: next == null ? 'completed' : 'active',
      startedCount: 0, lastFiredOccurrenceMs: null, snoozedUntil: null,
      completedAt: next == null ? serverTimestamp() : null,
      nextFireAt: next,
      updatedAt: serverTimestamp(),
    })
  },

  /** Enable/disable. Keeps nextFireAt PRESENT (never deleted) so the doc stays in
   *  the orderBy query; §6 excludes disabled alerts from the due set. (B4) */
  async setEnabled(uid, id, enabled) {
    await updateDoc(plainRef(uid, id), { enabled: !!enabled, updatedAt: serverTimestamp() })
  },

  async markRead(uid, id) {
    await updateDoc(plainRef(uid, id), { readAt: serverTimestamp() })
  },

  /**
   * The exactly-once gate (B2). In ONE transaction: re-read the doc, bail if this
   * occurrence was already fired (another tab/tick won), else stamp
   * lastFiredOccurrenceMs + advance nextFireAt to the next FUTURE slot. ONLY a
   * `{fired:true}` return authorizes the caller to toast/Notify — neither channel
   * fires otherwise, so two open tabs produce exactly one toast + one Notification.
   */
  async fireAdvance(uid, alert, nowMs) {
    const r = plainRef(uid, alert.id)
    return runTransaction(db(), async (tx) => {
      const snap = await tx.get(r)
      if (!snap.exists()) return { fired: false }
      const parsed = alertSchema.safeParse({ ...snap.data(), id: snap.id })
      const a = parsed.success ? parsed.data : { ...snap.data(), id: snap.id }
      const occ = a.nextFireAt
      if (a.status !== 'active' || a.enabled === false || occ == null) return { fired: false }
      // ROUND-2 FIX B1: Firestore auto-retries a contended tx. A loser tab's retry
      // re-reads the doc AFTER the winner advanced nextFireAt to a FUTURE slot; without
      // this guard the stale lastFiredOccurrenceMs check passes and it double-fires a
      // not-yet-due occurrence. Only fire an occurrence that is actually due.
      if (occ > nowMs) return { fired: false }
      // Already delivered for this occurrence? Loser tab/tick → do nothing.
      if (a.lastFiredOccurrenceMs != null && a.lastFiredOccurrenceMs >= occ) return { fired: false }

      const fired = (a.startedCount || 0) + 1
      const reachedCount = a.recurrence?.count != null && fired >= a.recurrence.count
      const next = (a.recurrence?.freq && a.recurrence.freq !== 'NONE' && !reachedCount)
        ? advanceAfter(a.recurrence, occ, nowMs, a.fireAt)
        : null
      const completed = next == null

      tx.update(r, {
        lastFiredOccurrenceMs: occ,
        lastFiredAt: serverTimestamp(),
        startedCount: fired,
        snoozedUntil: null,
        nextFireAt: completed ? null : next,           // number or explicit null (B4)
        status: completed ? 'completed' : 'active',
        completedAt: completed ? serverTimestamp() : (a.completedAt ?? null),
        updatedAt: serverTimestamp(),
      })
      return { fired: true, occurrenceMs: occ, completed }
    })
  },

  // ── Soft-delete + cascade ──────────────────────────────────────────────────
  async archive(uid, id) {
    await updateDoc(plainRef(uid, id), { archived: true, archivedAt: serverTimestamp() })
  },
  async restore(uid, id) {
    await updateDoc(plainRef(uid, id), { archived: false, archivedAt: null })
  },

  /**
   * Permanent delete. CASCADE the Storage bytes first (B3): without this, every
   * persisted attachment leaks forever (no doc left to find it → unbounded billing
   * + a data-retention hole, since the persisted download URL stays fetchable).
   * Best-effort per file; doc delete proceeds regardless.
   */
  async purge(uid, id) {
    const a = await this.get(uid, id)
    for (const att of a?.attachments ?? []) {
      if (att?.path) await storageRepo.deleteAttachment(att.path).catch(() => {})
    }
    await deleteDoc(plainRef(uid, id))
  },
}
