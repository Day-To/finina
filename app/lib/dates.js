// Small calendar helpers for period keys ("YYYY-MM") and ISO dates. Pure JS.

/** Zero-padded current month key, local time. @returns {string} "YYYY-MM" */
export function currentMonthId(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Today's date in 'YYYY-MM-DD' (local). @returns {string} */
export function todayISO(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Validate a "YYYY-MM" key. */
export function isMonthId(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value))
}

/** "2026-06" → "June 2026" (locale-aware month name). */
export function formatMonthLabel(monthId, locale) {
  if (!isMonthId(monthId)) return monthId ?? ''
  const [y, m] = monthId.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString(locale || undefined, { month: 'long', year: 'numeric' })
}

/** Short month name only, e.g. "Jun". */
export function shortMonthLabel(monthId, locale) {
  if (!isMonthId(monthId)) return monthId ?? ''
  const [y, m] = monthId.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(locale || undefined, { month: 'short' })
}

/** Year part of a "YYYY-MM" key as a number. */
export function yearOf(monthId) {
  return Number(String(monthId).slice(0, 4))
}

/** "2026-06-14" → locale date label. */
export function formatDateLabel(iso, locale) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale || undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

/**
 * Days elapsed in a month relative to today: full month if it's in the past,
 * 0 if in the future, today's day-of-month (clamped) if it's the current month.
 */
export function elapsedDaysInMonth(monthId, now = new Date()) {
  if (!isMonthId(monthId)) return 0
  const [y, m] = monthId.split('-').map(Number)
  const total = new Date(y, m, 0).getDate()
  const cur = currentMonthId(now)
  if (monthId < cur) return total
  if (monthId > cur) return 0
  return Math.min(total, now.getDate())
}

/** Add (or subtract) whole months to a "YYYY-MM" key. */
export function shiftMonthId(monthId, delta) {
  const [y, m] = monthId.split('-').map(Number)
  const base = new Date(y, m - 1 + delta, 1)
  return currentMonthId(base)
}
