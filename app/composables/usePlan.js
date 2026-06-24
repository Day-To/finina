// Active plan + its active version (§7). saveVersion is append-only (mints a new
// UUID version, currency-stamped, and points the plan at it). revertTo branches
// a new active version from an old one (§15).
import { ref, computed, watch, onScopeDispose } from 'vue'
import { plansRepo } from '~/repositories/plans.js'
import { planVersionsRepo } from '~/repositories/planVersions.js'

/** @param {'monthly'|'yearly'} type */
export function usePlan(type) {
  const auth = useAuthStore()
  const uid = () => {
    const u = auth.user?.uid
    if (!u) throw new Error('Not signed in')
    return u
  }

  const plan = ref(null)
  const activeVersion = ref(null)
  const loading = ref(true)

  let unsubPlan = null
  let versionToken = 0

  async function loadVersion(u, versionId) {
    const token = ++versionToken
    if (!u || !versionId) { activeVersion.value = null; return }
    const v = await planVersionsRepo.get(u, type, versionId)
    // Guard against out-of-order resolution when activeVersionId changes fast.
    if (token === versionToken) activeVersion.value = v
  }

  function start(u) {
    stop()
    if (!u) { plan.value = null; activeVersion.value = null; loading.value = false; return }
    loading.value = true
    unsubPlan = plansRepo.subscribe(u, type, async (p) => {
      plan.value = p
      await loadVersion(u, p?.activeVersionId)
      loading.value = false
    }, (e) => {
      console.error('[finina] plan subscription error', e)
      loading.value = false
    })
  }

  function stop() {
    if (unsubPlan) { unsubPlan(); unsubPlan = null }
  }

  watch(() => auth.user?.uid, (u) => start(u), { immediate: true })
  onScopeDispose(stop)

  const hasActiveVersion = computed(() => !!activeVersion.value)

  /** Append a new version (append-only) and make it active. */
  async function saveVersion(body) {
    const u = uid()
    const version = await planVersionsRepo.createVersion(u, type, body)
    await plansRepo.setActiveVersion(u, type, version.id)
    return version
  }

  /** Branch a new active version from an existing one (revert). */
  async function revertTo(versionId) {
    const u = uid()
    const old = await planVersionsRepo.get(u, type, versionId)
    if (!old) throw new Error('Version not found')
    const { id: _id, createdAt: _createdAt, ...body } = old
    body.basedOn = versionId
    return saveVersion(body)
  }

  return { plan, activeVersion, loading, hasActiveVersion, saveVersion, revertTo }
}
