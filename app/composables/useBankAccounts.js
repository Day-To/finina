// Bank accounts (§7): app-wide reactive list + CRUD. Warns before deleting an
// account referenced by a plan flow.
import { ref, computed } from 'vue'
import { bankAccountsRepo } from '~/repositories/bankAccounts.js'
import { plansRepo } from '~/repositories/plans.js'
import { planVersionsRepo } from '~/repositories/planVersions.js'
import { monthsRepo } from '~/repositories/months.js'

const accounts = ref([])
const loading = ref(true)
let initialized = false
let unsub = null

function start(uid) {
  if (unsub) { unsub(); unsub = null }
  if (!uid) { accounts.value = []; loading.value = false; return }
  loading.value = true
  unsub = bankAccountsRepo.subscribe(uid, (list) => {
    accounts.value = list
    loading.value = false
  }, (e) => {
    console.error('[finina] bank accounts subscription error', e)
    loading.value = false
  })
}

function init() {
  if (initialized) return
  initialized = true
  const auth = useAuthStore()
  watch(() => auth.user?.uid, (uid) => start(uid), { immediate: true })
}

export function useBankAccounts() {
  init()
  const auth = useAuthStore()
  const uid = () => {
    const u = auth.user?.uid
    if (!u) throw new Error('Not signed in')
    return u
  }

  // `byId` resolves ALL accounts (incl. archived) so past months keep their names.
  const byId = computed(() => new Map(accounts.value.map((a) => [a.id, a])))
  // Active = pickers / new work; archived = retired (still resolvable for history).
  const activeAccounts = computed(() => accounts.value.filter((a) => !a.archived))
  const archivedAccounts = computed(() => accounts.value.filter((a) => a.archived))
  const isEmpty = computed(() => !loading.value && activeAccounts.value.length === 0)

  /**
   * Where (if anywhere) the active monthly plan flow references this account.
   * @param {string} accountId
   * @returns {Promise<{referenced:boolean, asIncome:boolean, allocationCount:number}>}
   */
  async function referencesFor(accountId) {
    const plan = await plansRepo.get(uid(), 'monthly')
    const version = plan?.activeVersionId
      ? await planVersionsRepo.get(uid(), 'monthly', plan.activeVersionId)
      : null
    const flow = version?.flow
    const asIncome = flow?.incomeAccountId === accountId
    const allocationCount = (flow?.allocations ?? []).filter((a) => a.accountId === accountId).length
    return { referenced: asIncome || allocationCount > 0, asIncome, allocationCount }
  }

  // Per-call full scan of materialized months (behind a user-opened dialog).
  async function referencesInMonths() {
    return (await monthsRepo.countReferences(uid())).bank
  }

  return {
    accounts,
    activeAccounts,
    archivedAccounts,
    loading,
    isEmpty,
    byId,
    get: (id) => bankAccountsRepo.get(uid(), id),
    create: (input) => bankAccountsRepo.create(uid(), input),
    update: (id, patch) => bankAccountsRepo.update(uid(), id, patch),
    archive: (id) => bankAccountsRepo.archive(uid(), id),
    restore: (id) => bankAccountsRepo.restore(uid(), id),
    purge: (id) => bankAccountsRepo.purge(uid(), id),
    referencesFor,
    referencesInMonths,
  }
}
