// Daily transactions for a month (§7, S9). Subscribes (date desc); stamps the
// month's currency on new entries. Budget summary derives from the month doc.
import { ref, computed, watch, onScopeDispose, toValue } from 'vue'
import { dailyExpensesRepo } from '~/repositories/dailyExpenses.js'
import { dailySummary, groupByDate } from '~/domain/calc/daily.js'

/**
 * @param {import('vue').MaybeRefOrGetter<string>} monthIdRef "YYYY-MM"
 * @param {import('vue').MaybeRefOrGetter<object|null>} monthRef the month doc (for currency + budget)
 */
export function useDaily(monthIdRef, monthRef) {
  const auth = useAuthStore()
  const uid = () => {
    const u = auth.user?.uid
    if (!u) throw new Error('Not signed in')
    return u
  }
  const monthId = computed(() => toValue(monthIdRef))

  const expenses = ref([])
  const loading = ref(true)
  let unsub = null

  function start() {
    stop()
    const u = auth.user?.uid
    const id = monthId.value
    if (!u || !id) { expenses.value = []; loading.value = false; return }
    loading.value = true
    unsub = dailyExpensesRepo.subscribe(u, id, (list) => {
      expenses.value = list
      loading.value = false
    }, (e) => {
      console.error('[finina] daily expenses subscription error', e)
      loading.value = false
    })
  }

  function stop() {
    if (unsub) { unsub(); unsub = null }
  }

  watch([() => auth.user?.uid, monthId], start, { immediate: true })
  onScopeDispose(stop)

  const summary = computed(() => dailySummary(toValue(monthRef), expenses.value))
  const grouped = computed(() => groupByDate(expenses.value))
  const isEmpty = computed(() => !loading.value && expenses.value.length === 0)

  function currency() {
    const c = toValue(monthRef)?.currency
    if (!c) throw new Error('Month currency is not available yet')
    return c
  }

  return {
    expenses,
    loading,
    isEmpty,
    summary,
    grouped,
    add: (input) => dailyExpensesRepo.add(uid(), monthId.value, input, currency()),
    update: (id, patch) => dailyExpensesRepo.update(uid(), monthId.value, id, patch),
    remove: (id) => dailyExpensesRepo.remove(uid(), monthId.value, id),
  }
}
