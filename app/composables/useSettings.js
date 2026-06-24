// Reactive user settings (§7). App-wide singleton: one Firestore subscription to
// the users/{uid} doc, restarted when the signed-in user changes.
import { ref } from 'vue'
import { settingsRepo } from '~/repositories/settings.js'
import { DEFAULT_CURRENCY } from '~/domain/currencies.js'

const settings = ref(null)
const loading = ref(true)
let initialized = false
let unsub = null
let currentUid = null

function start(uid) {
  if (unsub) { unsub(); unsub = null }
  currentUid = uid
  if (!uid) { settings.value = null; loading.value = false; return }
  loading.value = true
  unsub = settingsRepo.subscribe(uid, (s) => {
    settings.value = s
    loading.value = false
  }, (e) => {
    console.error('[finina] settings subscription error', e)
    loading.value = false
  })
}

function init() {
  if (initialized) return
  initialized = true
  const auth = useAuthStore()
  // Lives for the app lifetime (app-wide singleton); restarts on uid change.
  watch(() => auth.user?.uid, (uid) => start(uid), { immediate: true })
}

export function useSettings() {
  init()
  const auth = useAuthStore()

  /** True once we know whether settings exist (subscription has reported). */
  const ready = computed(() => !loading.value)
  /** Onboarding complete = a currency has been chosen. */
  const hasSettings = computed(() => !!settings.value?.currency)
  const currency = computed(() => settings.value?.currency ?? DEFAULT_CURRENCY)
  const locale = computed(() => settings.value?.locale ?? undefined)

  async function ensureCreated(input) {
    const uid = auth.user?.uid
    if (!uid) throw new Error('Not signed in')
    return settingsRepo.create(uid, input)
  }

  async function setCurrency(code) {
    const uid = auth.user?.uid
    if (!uid) throw new Error('Not signed in')
    await settingsRepo.update(uid, { currency: code })
  }

  async function setLocale(loc) {
    const uid = auth.user?.uid
    if (!uid) throw new Error('Not signed in')
    await settingsRepo.update(uid, { locale: loc || null })
  }

  return { settings, loading, ready, hasSettings, currency, locale, ensureCreated, setCurrency, setLocale }
}
