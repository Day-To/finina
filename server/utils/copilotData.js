// Server-side data readers for the AI copilot. Uses the Firebase Admin SDK
// (server/utils/firebaseAdmin.js) to read users/{uid}/... and the framework-free
// domain core (app/domain/*) to derive figures. Every money value is formatted
// via formatMoney before it is handed to the model. READ-ONLY.
//
// The pure domain modules (zod + crypto.randomUUID only) are imported via the
// `#domain` alias (configured in nuxt.config.js -> nitro.alias) so they resolve
// in BOTH the Nitro dev server and the production build. (A bare relative
// `../../app/domain/...` import inlines in the build but mis-resolves in dev.)
import { adminDb } from './firebaseAdmin.js'
import { formatMoney } from '#domain/money.js'
import * as calc from '#domain/calc/index.js'

export const DEFAULT_CURRENCY = 'INR'

// ── Time (server timezone, NOT trusted from the client) ───────────────────────
// Mirrors server/utils/expenses.js: default to Asia/Kolkata, overridable by env.
export function serverToday() {
  const tz = process.env.COPILOT_TZ || 'Asia/Kolkata'
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  }
  catch {
    return new Date().toISOString().slice(0, 10)
  }
}
export function serverCurrentMonth() {
  return serverToday().slice(0, 7)
}

// ── Readers (literal users/{uid}/... paths, mirroring the client repos) ────────
export async function loadSettings(uid) {
  const snap = await adminDb().doc(`users/${uid}`).get()
  const d = snap.exists ? snap.data() : null
  return { currency: d?.currency || DEFAULT_CURRENCY, locale: d?.locale || undefined }
}

export async function loadMonth(uid, monthId) {
  const snap = await adminDb().doc(`users/${uid}/months/${monthId}`).get()
  return snap.exists ? { month: monthId, ...snap.data() } : null
}

/** All months, newest period first (matches monthsRepo.list). */
export async function loadMonthsList(uid) {
  const snap = await adminDb().collection(`users/${uid}/months`).orderBy('month', 'desc').get()
  return snap.docs.map((d) => ({ month: d.id, ...d.data() }))
}

export async function loadExpenses(uid, monthId, limit = 50) {
  const cap = Math.max(1, Math.min(2000, Number(limit) || 50))
  const snap = await adminDb()
    .collection(`users/${uid}/months/${monthId}/dailyExpenses`)
    .orderBy('date', 'desc')
    .limit(cap)
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function loadAccounts(uid) {
  const snap = await adminDb().collection(`users/${uid}/bankAccounts`).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function loadInvestmentsRegistry(uid) {
  const snap = await adminDb().collection(`users/${uid}/investments`).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Active plan version body for a type (plans/{type}.activeVersionId -> versions/{id}). */
export async function loadActivePlanVersion(uid, type) {
  const ptr = await adminDb().doc(`users/${uid}/plans/${type}`).get()
  const vid = ptr.exists ? ptr.data()?.activeVersionId : null
  if (!vid) return null
  const v = await adminDb().doc(`users/${uid}/plans/${type}/versions/${vid}`).get()
  return v.exists ? { id: vid, ...v.data() } : null
}

/** Active investment routing version (investmentPlan/plan.activeVersionId -> versions/{id}). */
export async function loadInvestmentPlanVersion(uid) {
  const ptr = await adminDb().doc(`users/${uid}/investmentPlan/plan`).get()
  const vid = ptr.exists ? ptr.data()?.activeVersionId : null
  if (!vid) return null
  const v = await adminDb().doc(`users/${uid}/investmentPlan/plan/versions/${vid}`).get()
  return v.exists ? { id: vid, ...v.data() } : null
}

// ── Currency helpers (B4: never blend totals across currencies) ───────────────
/** @returns {{ mixed:boolean, currency:string, currencies:string[] }} */
export function monthsCurrency(months) {
  const set = new Set((months ?? []).map((m) => m.currency).filter(Boolean))
  const currencies = [...set]
  if (currencies.length <= 1) return { mixed: false, currency: currencies[0] || DEFAULT_CURRENCY, currencies }
  return { mixed: true, currency: currencies[0], currencies }
}

/** A bound money formatter for a given currency/locale. */
export function makeFmt(currency, locale) {
  return (minor) => formatMoney(minor ?? 0, currency || DEFAULT_CURRENCY, locale)
}

export { calc }
