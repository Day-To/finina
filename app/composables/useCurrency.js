// Resolve the ACTIVE currency for a screen (§7): the document's stamped
// currency, falling back to the user default. Exposes format()/toMinor() bound
// to it. Formatting/entry is the only currency-aware boundary in the app.
import { computed, unref } from 'vue'
import { formatMoney, toMinor, fromMinor, decimalDigits, currencySymbol } from '~/domain/money.js'
import { DEFAULT_CURRENCY } from '~/domain/currencies.js'

/**
 * @param {import('vue').MaybeRefOrGetter<string|undefined>} [docCurrency]
 *   the stamped currency of the doc on screen (e.g. month.currency)
 */
export function useCurrency(docCurrency) {
  const { settings } = useSettings()

  const code = computed(() => {
    const doc = typeof docCurrency === 'function' ? docCurrency() : unref(docCurrency)
    return doc || settings.value?.currency || DEFAULT_CURRENCY
  })
  // Default to Indian digit grouping (x,xx,xx,xxx) unless the user sets a locale.
  const locale = computed(() => settings.value?.locale || 'en-IN')
  const digits = computed(() => decimalDigits(code.value))

  return {
    code,
    locale,
    digits,
    symbol: computed(() => currencySymbol(code.value, locale.value)),
    /** integer minor units → localized string */
    format: (minor) => formatMoney(minor, code.value, locale.value),
    /** major-unit number/string → integer minor units */
    toMinor: (major) => toMinor(major, code.value),
    /** integer minor units → major-unit number */
    fromMinor: (minor) => fromMinor(minor, code.value),
  }
}
