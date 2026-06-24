// The reusable investment routing plan + its append-only version history
// (mirrors usePlan). Saving creates a NEW version and points the plan at it;
// restoring points the plan at an older version. App-wide singleton.
import { ref, computed } from 'vue'
import { investmentPlanRepo } from '~/repositories/investmentPlan.js'

const plan = ref({ activeVersionId: null }) // pointer
const activeVersion = ref(null)
const versions = ref([])
const loading = ref(true)
let initialized = false
let unsubPlan = null
let unsubVersions = null
let versionToken = 0
let migrating = false

async function loadActive(uid, versionId) {
  const token = ++versionToken
  if (!uid || !versionId) { activeVersion.value = null; return }
  const v = await investmentPlanRepo.getVersion(uid, versionId)
  if (token === versionToken) activeVersion.value = v
}

// One-time lift of pre-versioning routing (legacy singleton fields) into version 1.
async function migrateLegacy(uid, p) {
  if (migrating || p.activeVersionId) return
  const hasLegacy = (p.mfRouting?.length || p.stockRouting?.length)
  if (!hasLegacy) return
  migrating = true
  try {
    // If a prior (partially-failed) migration already wrote a version, just point
    // at it instead of creating a duplicate.
    const existing = await investmentPlanRepo.listVersions(uid)
    if (existing.length) await investmentPlanRepo.setActiveVersion(uid, existing[0].id)
    else await investmentPlanRepo.saveRouting(uid, { mfRouting: p.mfRouting ?? [], stockRouting: p.stockRouting ?? [], label: 'Initial' })
  }
  catch (e) { console.error('[finina] routing migration failed', e); migrating = false }
}

function start(uid) {
  if (unsubPlan) { unsubPlan(); unsubPlan = null }
  if (unsubVersions) { unsubVersions(); unsubVersions = null }
  if (!uid) { plan.value = { activeVersionId: null }; activeVersion.value = null; versions.value = []; loading.value = false; return }
  loading.value = true
  unsubPlan = investmentPlanRepo.subscribe(uid, async (p) => {
    plan.value = p
    await loadActive(uid, p?.activeVersionId)
    migrateLegacy(uid, p)
    loading.value = false
  }, (e) => { console.error('[finina] investment plan subscription error', e); loading.value = false })
  unsubVersions = investmentPlanRepo.subscribeVersions(uid, (list) => { versions.value = list }, (e) => console.error('[finina] investment plan versions error', e))
}

function init() {
  if (initialized) return
  initialized = true
  const auth = useAuthStore()
  watch(() => auth.user?.uid, (uid) => { migrating = false; start(uid) }, { immediate: true })
}

export function useInvestmentPlan() {
  init()
  const auth = useAuthStore()
  const uid = () => {
    const u = auth.user?.uid
    if (!u) throw new Error('Not signed in')
    return u
  }

  // Active version's routing (legacy singleton as fallback until migration lands).
  const mfRouting = computed(() => activeVersion.value?.mfRouting ?? plan.value?.mfRouting ?? [])
  const stockRouting = computed(() => activeVersion.value?.stockRouting ?? plan.value?.stockRouting ?? [])

  // Save a NEW version with the full routing (defaults to the current other side).
  const saveRouting = (body) => investmentPlanRepo.saveRouting(uid(), { mfRouting: body.mfRouting ?? mfRouting.value, stockRouting: body.stockRouting ?? stockRouting.value, label: body.label })
  return {
    plan,
    activeVersion,
    versions,
    loading,
    activeVersionId: computed(() => plan.value?.activeVersionId ?? null),
    mfRouting,
    stockRouting,
    saveRouting,
    saveMfRouting: (rows, label) => saveRouting({ mfRouting: rows, label }),
    saveStockRouting: (rows, label) => saveRouting({ stockRouting: rows, label }),
    restoreVersion: (id) => investmentPlanRepo.setActiveVersion(uid(), id),
  }
}
