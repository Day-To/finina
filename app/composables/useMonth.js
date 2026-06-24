// A materialized month instance (§7, S8). Subscribes to the month doc; can
// materialize from the active plans, save manual edits, and re-sync from plan
// (explicit diff-then-apply, preserving manual rows + checklist progress).
import { ref, computed, watch, onScopeDispose, toValue } from 'vue'
import { monthsRepo } from '~/repositories/months.js'
import { plansRepo } from '~/repositories/plans.js'
import { planVersionsRepo } from '~/repositories/planVersions.js'
import { investmentPlanRepo } from '~/repositories/investmentPlan.js'
import { buildMonthSeed } from '~/domain/calc/seed.js'
import { totalFixed, totalVariable, totalExpenses, surplus, surplusAmounts, accountTransfers, reconcile } from '~/domain/calc/index.js'
import { DEFAULT_CURRENCY } from '~/domain/currencies.js'

/** @param {import('vue').MaybeRefOrGetter<string>} monthIdRef "YYYY-MM" */
export function useMonth(monthIdRef) {
  const auth = useAuthStore()
  const { byId: accountsById } = useBankAccounts()
  const { investments } = useInvestments()
  const { settings } = useSettings()
  const uid = () => {
    const u = auth.user?.uid
    if (!u) throw new Error('Not signed in')
    return u
  }
  const monthId = computed(() => toValue(monthIdRef))

  const month = ref(null)
  const loading = ref(true)
  let unsub = null

  function start() {
    stop()
    const u = auth.user?.uid
    const id = monthId.value
    if (!u || !id) { month.value = null; loading.value = false; return }
    loading.value = true
    unsub = monthsRepo.subscribe(u, id, (m) => {
      month.value = m
      loading.value = false
    }, (e) => {
      console.error('[finina] month subscription error', e)
      loading.value = false
    })
  }

  function stop() {
    if (unsub) { unsub(); unsub = null }
  }

  watch([() => auth.user?.uid, monthId], start, { immediate: true })
  onScopeDispose(stop)

  const exists = computed(() => !!month.value)

  // Derived figures (currency-agnostic minor units).
  const totals = computed(() => {
    const m = month.value
    if (!m) return null
    return {
      fixed: totalFixed(m),
      variable: totalVariable(m),
      expenses: totalExpenses(m),
      surplus: surplus(m),
      surplusItems: surplusAmounts(m),
      transfers: accountTransfers(m),
      reconcile: reconcile(m),
    }
  })

  // Load the active plan versions needed to materialize/resync.
  async function loadActiveVersions() {
    const u = uid()
    const [monthlyPlan, yearlyPlan] = await Promise.all([
      plansRepo.get(u, 'monthly'),
      plansRepo.get(u, 'yearly'),
    ])
    const [monthlyVersion, yearlyVersion, investmentPlan] = await Promise.all([
      monthlyPlan?.activeVersionId ? planVersionsRepo.get(u, 'monthly', monthlyPlan.activeVersionId) : null,
      yearlyPlan?.activeVersionId ? planVersionsRepo.get(u, 'yearly', yearlyPlan.activeVersionId) : null,
      investmentPlanRepo.getActive(u), // the active routing version
    ])
    return { monthlyVersion, yearlyVersion, investmentPlan }
  }

  function seedCurrency(monthlyVersion) {
    return monthlyVersion?.currency || settings.value?.currency || DEFAULT_CURRENCY
  }

  /** Materialize the month from the active monthly (+ yearly) plan versions. */
  async function materializeFromPlans() {
    const { monthlyVersion, yearlyVersion, investmentPlan } = await loadActiveVersions()
    if (!monthlyVersion) throw new Error('No active monthly plan to materialize from')
    const seed = buildMonthSeed(monthlyVersion, yearlyVersion, monthId.value, seedCurrency(monthlyVersion), accountsById.value, investmentPlan, investments.value)
    await monthsRepo.upsert(uid(), monthId.value, seed)
    return seed
  }

  /** Create an empty (blank) month stamped with the current default currency. */
  async function createBlank() {
    const blank = {
      month: monthId.value,
      currency: settings.value?.currency || DEFAULT_CURRENCY,
      seededFrom: null,
      income: 0,
      fixedExpenses: [],
      variableExpenses: [],
      surplus: [],
      flow: { incomeAccountId: null, allocations: [] },
      investments: { mf: [], stocks: [], holdings: [], holdingsFrozen: true },
      checklist: [],
    }
    await monthsRepo.upsert(uid(), monthId.value, blank)
    return blank
  }

  /** Persist manual edits (full month object). */
  async function save(data) {
    await monthsRepo.upsert(uid(), monthId.value, { ...data, month: monthId.value })
  }

  /**
   * Preview a re-sync: build a fresh seed from the active plans and summarize
   * what would change. Does not write anything.
   */
  async function previewResync() {
    const { monthlyVersion, yearlyVersion, investmentPlan } = await loadActiveVersions()
    if (!monthlyVersion) throw new Error('No active monthly plan to re-sync from')
    const next = buildMonthSeed(monthlyVersion, yearlyVersion, monthId.value, seedCurrency(monthlyVersion), accountsById.value, investmentPlan, investments.value)
    const cur = month.value
    const isManual = (l) => l.source !== 'MONTHLY' && l.source !== 'YEARLY'
    const invCount = (m) => (m?.investments?.mf ?? []).length + (m?.investments?.stocks ?? []).length
    const curHoldings = cur?.investments?.holdings ?? []
    const nextHoldings = next.investments?.holdings ?? []
    const diff = {
      incomeChanged: (cur?.income ?? 0) !== next.income,
      fixedBefore: (cur?.fixedExpenses ?? []).length,
      fixedAfter: next.fixedExpenses.length,
      variableBefore: (cur?.variableExpenses ?? []).length,
      variableAfter: next.variableExpenses.length,
      investmentBefore: invCount(cur),
      investmentAfter: invCount(next),
      holdingsBefore: curHoldings.length,
      holdingsAfter: nextHoldings.length,
      holdingsDropped: curHoldings.filter((h) => !nextHoldings.some((n) => n.id === h.id)).length,
      manualPreserved: (cur?.fixedExpenses ?? []).filter(isManual).length
        + (cur?.variableExpenses ?? []).filter(isManual).length
        + (cur?.surplus ?? []).filter(isManual).length,
    }
    return { next, diff }
  }

  /**
   * Apply a re-sync: replace plan-sourced rows with the fresh seed while keeping
   * the user's MANUAL rows and checklist progress (done states).
   */
  async function applyResync(next) {
    const cur = month.value ?? {}
    // Keep any row that isn't plan-sourced (covers MANUAL rows and any legacy
    // untagged rows), so re-sync never silently deletes user-added lines.
    const keepManual = (rows) => (rows ?? []).filter((l) => l.source !== 'MONTHLY' && l.source !== 'YEARLY')

    // Preserve done-state on stable keys: auto (transfer) to-dos by accountId,
    // manual to-dos by label using a count so duplicate labels don't over-mark.
    const prev = cur.checklist ?? []
    const doneAuto = new Set(prev.filter((c) => c.isAuto && c.isDone && c.accountId).map((c) => c.accountId))
    const manualDone = new Map()
    for (const c of prev) {
      if (!c.isAuto && c.isDone) manualDone.set(c.label, (manualDone.get(c.label) ?? 0) + 1)
    }

    const merged = {
      ...next,
      fixedExpenses: [...next.fixedExpenses, ...keepManual(cur.fixedExpenses)],
      variableExpenses: [...next.variableExpenses, ...keepManual(cur.variableExpenses)],
      surplus: [...next.surplus, ...keepManual(cur.surplus)],
      checklist: next.checklist.map((c) => {
        if (c.isAuto) return c.accountId && doneAuto.has(c.accountId) ? { ...c, isDone: true } : c
        const n = manualDone.get(c.label) ?? 0
        if (n > 0) { manualDone.set(c.label, n - 1); return { ...c, isDone: true } }
        return c
      }),
      createdAt: cur.createdAt,
    }
    await monthsRepo.upsert(uid(), monthId.value, merged)
    return merged
  }

  return {
    monthId,
    month,
    loading,
    exists,
    totals,
    materializeFromPlans,
    createBlank,
    save,
    previewResync,
    applyResync,
  }
}
