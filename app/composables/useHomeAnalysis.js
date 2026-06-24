// Home dashboard data (§7, S1): month-on-month series + the current month.
import { ref, computed, watch, onScopeDispose } from 'vue'
import { monthsRepo } from '~/repositories/months.js'
import { homeAnalysis } from '~/domain/calc/home.js'
import { currentMonthId } from '~/lib/dates.js'

export function useHomeAnalysis() {
  const auth = useAuthStore()
  const months = ref([])
  const loading = ref(true)
  let unsub = null

  function start(u) {
    stop()
    if (!u) { months.value = []; loading.value = false; return }
    loading.value = true
    unsub = monthsRepo.subscribeList(u, (list) => {
      months.value = list
      loading.value = false
    }, (e) => {
      console.error('[finina] months subscription error', e)
      loading.value = false
    })
  }

  function stop() {
    if (unsub) { unsub(); unsub = null }
  }

  watch(() => auth.user?.uid, (u) => start(u), { immediate: true })
  onScopeDispose(stop)

  const analysis = computed(() => homeAnalysis(months.value))
  const thisMonthId = computed(() => currentMonthId())
  const currentMonth = computed(
    () => months.value.find((m) => m.month === thisMonthId.value) ?? null,
  )
  const isEmpty = computed(() => !loading.value && months.value.length === 0)

  return { months, loading, isEmpty, analysis, currentMonth, thisMonthId }
}
