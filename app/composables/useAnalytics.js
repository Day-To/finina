// Insights data: every month (live subscription) + each month's daily expenses
// (one-shot per snapshot). Aggregation itself lives in domain/calc/analytics.js.
import { ref, watch, onScopeDispose } from 'vue'
import { monthsRepo } from '~/repositories/months.js'
import { dailyExpensesRepo } from '~/repositories/dailyExpenses.js'

export function useAnalytics() {
  const auth = useAuthStore()
  const months = ref([])
  const dailyByMonth = ref({})
  const loading = ref(true)
  let unsub = null
  let token = 0

  function start(u) {
    stop()
    if (!u) { months.value = []; dailyByMonth.value = {}; loading.value = false; return }
    loading.value = true
    unsub = monthsRepo.subscribeList(u, async (list) => {
      months.value = list
      loading.value = false
      // Pull each month's daily expenses; guard against an out-of-order snapshot.
      const mine = ++token
      const map = {}
      await Promise.all(list.map(async (m) => {
        try { map[m.month] = await dailyExpensesRepo.list(u, m.month) }
        catch { map[m.month] = [] }
      }))
      if (mine === token) dailyByMonth.value = map
    }, (e) => { console.error('[finina] analytics months error', e); loading.value = false })
  }
  function stop() { if (unsub) { unsub(); unsub = null } }

  watch(() => auth.user?.uid, (u) => start(u), { immediate: true })
  onScopeDispose(stop)

  return { months, dailyByMonth, loading }
}
