// Core "add a daily expense" logic for the public expense API. Mirrors the app's
// dailyExpenses repo write so an API-added entry is indistinguishable from one
// added in the UI: users/{uid}/months/{YYYY-MM}/dailyExpenses/{uuid}.
import { FieldValue } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'
import { adminDb } from './firebaseAdmin.js'

// Minor-unit conversion, mirroring app/domain/money.js (Intl-derived, currency-aware).
const DEFAULT_DIGITS = 2
const _digits = new Map()
function decimalDigits(code) {
  if (!code) return DEFAULT_DIGITS
  if (_digits.has(code)) return _digits.get(code)
  let d = DEFAULT_DIGITS
  try { d = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits }
  catch { d = DEFAULT_DIGITS }
  _digits.set(code, d)
  return d
}
const toMinor = (major, code) => Math.round(Number(major) * 10 ** decimalDigits(code))

function todayInTz(tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
  catch { return new Date().toISOString().slice(0, 10) }
}

/** Resolve flexible date input to an ISO 'YYYY-MM-DD' string. */
export function resolveDate(input, tz) {
  if (input == null || input === '') return todayInTz(tz)
  const s = String(input).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) // ISO (date or datetime)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/) // DD/MM/YYYY or DD-MM-YYYY
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) throw new Error(`Could not parse date: "${input}". Use YYYY-MM-DD or DD/MM/YYYY.`)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// Currency to stamp: the month's, else the user's default, else env default.
async function resolveCurrency(db, uid, monthId) {
  const monthSnap = await db.doc(`users/${uid}/months/${monthId}`).get()
  if (monthSnap.exists && monthSnap.data()?.currency) return monthSnap.data().currency
  const userSnap = await db.doc(`users/${uid}`).get()
  if (userSnap.exists && userSnap.data()?.currency) return userSnap.data().currency
  return process.env.EXPENSE_API_DEFAULT_CURRENCY || 'INR'
}

/**
 * Add one expense. `amount` is in MAJOR units (e.g. 250 = ₹250); it's converted
 * to the stamped currency's minor units before storing. The month is derived
 * from the date (its YYYY-MM).
 */
export async function addExpense({ item, amount, note, date } = {}) {
  if (typeof item !== 'string' || !item.trim()) throw new Error('"item" is required and must be a non-empty string.')
  const amt = typeof amount === 'string' && amount.trim() !== '' ? Number(amount) : amount
  if (typeof amt !== 'number' || !Number.isFinite(amt)) throw new Error('"amount" is required and must be a finite number.')
  if (amt <= 0) throw new Error('"amount" must be greater than zero.')

  const uid = process.env.EXPENSE_API_UID
  if (!uid) throw new Error('Server is missing EXPENSE_API_UID (the owner account to write to).')

  const iso = resolveDate(date, process.env.EXPENSE_API_TZ || 'Asia/Kolkata')
  const monthId = iso.slice(0, 7)
  const db = adminDb()
  const currency = await resolveCurrency(db, uid, monthId)
  const minor = toMinor(amt, currency)
  const id = randomUUID()

  await db.doc(`users/${uid}/months/${monthId}/dailyExpenses/${id}`).set({
    id,
    date: iso,
    item: item.trim(),
    amount: minor,
    note: note == null ? '' : String(note),
    category: null,
    currency,
    createdAt: FieldValue.serverTimestamp(),
  })

  return { month: monthId, id, date: iso, item: item.trim(), amount: minor, currency }
}
