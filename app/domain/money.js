// Currency-aware money helpers (§4 currency model). Currency is a property of
// money, not a global constant. Amounts are stored as integer MINOR UNITS sized
// to the document's stamped currency (INR/USD -> 2, JPY -> 0, KWD -> 3).
//
// No hardcoded symbols or grouping: everything derives from Intl.NumberFormat,
// so adding a currency is a one-line registry change.

const DEFAULT_DIGITS = 2

// Intl.NumberFormat construction is comparatively expensive; memoize per code.
const _digitsCache = new Map()

/**
 * Number of minor-unit decimal digits for an ISO 4217 currency code.
 * @param {string} code e.g. 'INR' | 'USD' | 'JPY' | 'KWD'
 * @returns {number}
 */
export function decimalDigits(code) {
  if (!code) return DEFAULT_DIGITS
  if (_digitsCache.has(code)) return _digitsCache.get(code)
  let digits = DEFAULT_DIGITS
  try {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency: code })
      .resolvedOptions().maximumFractionDigits
  }
  catch {
    digits = DEFAULT_DIGITS
  }
  _digitsCache.set(code, digits)
  return digits
}

/**
 * Factor (10 ** digits) between major and minor units for a currency.
 * @param {string} code
 * @returns {number}
 */
export function minorFactor(code) {
  return 10 ** decimalDigits(code)
}

/**
 * Convert a major-unit amount (what the user types) to integer minor units.
 * @param {number|string} major
 * @param {string} code
 * @returns {number} integer minor units (0 for non-finite input)
 */
export function toMinor(major, code) {
  const n = Number(major)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * minorFactor(code))
}

/**
 * Convert integer minor units back to a major-unit number.
 * @param {number} minor
 * @param {string} code
 * @returns {number}
 */
export function fromMinor(minor, code) {
  const n = Number(minor)
  if (!Number.isFinite(n)) return 0
  return n / minorFactor(code)
}

/**
 * Format integer minor units as a localized currency string.
 * @param {number} minor integer minor units
 * @param {string} code ISO 4217 code (e.g. 'INR')
 * @param {string} [locale] BCP-47 locale; defaults to the runtime default
 * @returns {string}
 */
export function formatMoney(minor, code, locale) {
  const value = fromMinor(minor, code)
  try {
    // Default to Indian digit grouping (x,xx,xx,xxx) when no locale is set.
    return new Intl.NumberFormat(locale || 'en-IN', { style: 'currency', currency: code })
      .format(value)
  }
  catch {
    // Unknown code: fall back to a plain number with the code suffixed.
    return `${value.toFixed(decimalDigits(code))} ${code ?? ''}`.trim()
  }
}

/**
 * The currency symbol for a code in a locale (e.g. '₹', '$', '¥'), derived from
 * Intl — never hardcoded. Useful for input adornments.
 * @param {string} code
 * @param {string} [locale]
 * @returns {string}
 */
export function currencySymbol(code, locale) {
  try {
    const parts = new Intl.NumberFormat(locale || undefined, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? code
  }
  catch {
    return code ?? ''
  }
}

/**
 * Sum a list of integer minor-unit amounts safely (ignores non-finite values).
 * The calc layer relies on integer addition staying exact within one currency.
 * @param {number[]} amounts
 * @returns {number}
 */
export function sumMinor(amounts) {
  let total = 0
  for (const a of amounts) {
    const n = Number(a)
    if (Number.isFinite(n)) total += Math.round(n)
  }
  return total
}
