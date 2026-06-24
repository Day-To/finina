// Version history for a plan type (§7, S6). Newest-first list + active id.
import { ref, computed, watch, onScopeDispose } from 'vue'
import { plansRepo } from '~/repositories/plans.js'
import { planVersionsRepo } from '~/repositories/planVersions.js'

/** @param {'monthly'|'yearly'} type */
export function usePlanHistory(type) {
  const auth = useAuthStore()
  const versions = ref([])
  const activeVersionId = ref(null)
  const loading = ref(true)

  let unsubVersions = null
  let unsubPlan = null

  function start(u) {
    stop()
    if (!u) { versions.value = []; activeVersionId.value = null; loading.value = false; return }
    loading.value = true
    unsubVersions = planVersionsRepo.subscribe(u, type, (list) => {
      versions.value = list
      loading.value = false
    }, (e) => {
      console.error('[finina] plan versions subscription error', e)
      loading.value = false
    })
    unsubPlan = plansRepo.subscribe(u, type, (p) => {
      activeVersionId.value = p?.activeVersionId ?? null
    })
  }

  function stop() {
    if (unsubVersions) { unsubVersions(); unsubVersions = null }
    if (unsubPlan) { unsubPlan(); unsubPlan = null }
  }

  watch(() => auth.user?.uid, (u) => start(u), { immediate: true })
  onScopeDispose(stop)

  const isEmpty = computed(() => !loading.value && versions.value.length === 0)

  return { versions, activeVersionId, loading, isEmpty }
}
