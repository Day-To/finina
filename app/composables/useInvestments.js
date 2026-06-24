// Investments registry (§ investments). App-wide singleton: one Firestore
// subscription, restarted on uid change. Mirrors useBankAccounts.
import { ref, computed } from 'vue'
import { investmentsRepo } from '~/repositories/investments.js'
import { monthsRepo } from '~/repositories/months.js'

const investments = ref([])
const loading = ref(true)
let initialized = false
let unsub = null

function start(uid) {
  if (unsub) { unsub(); unsub = null }
  if (!uid) { investments.value = []; loading.value = false; return }
  loading.value = true
  unsub = investmentsRepo.subscribe(uid, (list) => {
    investments.value = list
    loading.value = false
  }, (e) => {
    console.error('[finina] investments subscription error', e)
    loading.value = false
  })
}

function init() {
  if (initialized) return
  initialized = true
  const auth = useAuthStore()
  watch(() => auth.user?.uid, (uid) => start(uid), { immediate: true })
}

export function useInvestments() {
  init()
  const auth = useAuthStore()
  const uid = () => {
    const u = auth.user?.uid
    if (!u) throw new Error('Not signed in')
    return u
  }

  // Active = pickers / new routing (exclude archived). `investments` (full ref)
  // stays available for history resolution; byId-style lookups use it.
  const mutualFunds = computed(() => investments.value.filter((i) => i.kind === 'mutualFund' && !i.archived))
  const stocks = computed(() => investments.value.filter((i) => i.kind === 'stock' && !i.archived))
  const activeInvestments = computed(() => investments.value.filter((i) => !i.archived))
  const archivedInvestments = computed(() => investments.value.filter((i) => i.archived))

  // Live id Sets for badges (keyed by fundId) — a fund archived AFTER a month was
  // materialized flips into archivedFundIds and its badge appears on that month.
  const archivedFundIds = computed(() => new Set(investments.value.filter((i) => i.archived).map((i) => i.id)))
  const pausedFundIds = computed(() => new Set(investments.value.filter((i) => !i.archived && i.active === false).map((i) => i.id)))

  /** Sorted unique non-empty bucket names used by ACTIVE holdings of a kind. */
  function bucketNamesFor(kind) {
    const set = new Set(investments.value.filter((i) => i.kind === kind && !i.archived && (i.bucket || '').trim()).map((i) => i.bucket.trim()))
    return [...set].sort()
  }

  async function referencesInMonths() {
    return (await monthsRepo.countReferences(uid())).inv
  }

  return {
    investments,
    loading,
    mutualFunds,
    stocks,
    activeInvestments,
    archivedInvestments,
    archivedFundIds,
    pausedFundIds,
    isEmpty: computed(() => !loading.value && activeInvestments.value.length === 0),
    isEmptyMutualFunds: computed(() => !loading.value && mutualFunds.value.length === 0),
    isEmptyStocks: computed(() => !loading.value && stocks.value.length === 0),
    bucketNamesFor,
    referencesInMonths,
    get: (id) => investmentsRepo.get(uid(), id),
    create: (input) => investmentsRepo.create(uid(), input),
    update: (id, patch) => investmentsRepo.update(uid(), id, patch),
    archive: (id) => investmentsRepo.archive(uid(), id),
    restore: (id) => investmentsRepo.restore(uid(), id),
    purge: (id) => investmentsRepo.purge(uid(), id),
  }
}
