<script setup>
// S5 — Plan Designer wizard. Monthly: Income · Fixed · Variable(daily-budget) ·
// Surplus · Flow · To-dos. Yearly (reduced): dated recurring Fixed & Variable.
// Live summary in the plan's currency; sticky append-only "Save version".
import { ref, computed, watch } from 'vue'
import { toast } from 'vue-sonner'
import { newId } from '@/domain/ids.js'
import { sumMinor } from '@/domain/money.js'
import { totalFixed, totalVariable, totalExpenses, surplus, surplusAmounts, investmentPools } from '@/domain/calc/index.js'
import { PlusIcon, Trash2Icon, SaveIcon, ChevronLeftIcon, ChevronRightIcon, TrendingUpIcon } from '@lucide/vue'

definePageMeta({ key: (route) => route.fullPath })

const route = useRoute()
const planType = route.params.type === 'yearly' ? 'yearly' : 'monthly'
const isMonthly = planType === 'monthly'

const plan = usePlan(planType)
const { accounts } = useBankAccounts()
const { currency: defaultCurrency } = useSettings()
const invPlan = useInvestmentPlan()
const { mutualFunds, stocks, bucketNamesFor } = useInvestments()

const planCurrency = computed(() => plan.activeVersion.value?.currency || defaultCurrency.value)

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const clone = (v) => JSON.parse(JSON.stringify(v ?? null))

const body = ref(null)
const initialized = ref(false)

function emptyMonthly() {
  return { label: '', income: 0, fixedExpenses: [], variableExpenses: [], surplus: [], flow: { incomeAccountId: null, allocations: [] }, todos: [] }
}
function emptyYearly() {
  return { label: '', fixedExpenses: [], variableExpenses: [] }
}
function initBody() {
  if (initialized.value) return
  const av = plan.activeVersion.value
  if (isMonthly) {
    body.value = av
      ? { label: av.label || '', income: av.income || 0, fixedExpenses: clone(av.fixedExpenses) || [], variableExpenses: clone(av.variableExpenses) || [], surplus: clone(av.surplus) || [], flow: clone(av.flow) || { incomeAccountId: null, allocations: [] }, todos: clone(av.todos) || [] }
      : emptyMonthly()
  }
  else {
    body.value = av
      ? { label: av.label || '', fixedExpenses: clone(av.fixedExpenses) || [], variableExpenses: clone(av.variableExpenses) || [] }
      : emptyYearly()
  }
  initialized.value = true
}
watch(() => plan.loading.value, (l) => { if (!l) initBody() }, { immediate: true })

// ── Steps ─────────────────────────────────────────────────────────────────
const steps = isMonthly
  ? ['Income', 'Fixed', 'Variable', 'Surplus', 'Flow', 'Investments', 'To-dos']
  : ['Fixed expenses', 'Variable expenses']
const step = ref(0)
const isFirst = computed(() => step.value === 0)
const isLast = computed(() => step.value === steps.length - 1)
function next() { if (!isLast.value) step.value++ }
function prev() { if (!isFirst.value) step.value-- }

// ── Derived (monthly) ───────────────────────────────────────────────────────
const sumFixed = computed(() => (body.value ? totalFixed(body.value) : 0))
const sumVariable = computed(() => (body.value ? totalVariable(body.value) : 0))
const sumExpenses = computed(() => (body.value ? totalExpenses(body.value) : 0))
const surplusPool = computed(() => (body.value ? surplus(body.value) : 0))
const flowSources = computed(() => {
  if (!body.value) return []
  const f = (body.value.fixedExpenses || []).map((l) => ({ id: l.id, item: l.item || 'Fixed item', amount: l.amount, kind: 'expense' }))
  const v = (body.value.variableExpenses || []).map((l) => ({ id: l.id, item: l.item || 'Variable item', amount: l.amount, kind: 'expense' }))
  // Investment-routed surplus still flows to a bank account (then out to funds),
  // so it stays an assignable source in the flow.
  const s = surplusAmounts(body.value).map((x) => ({ id: x.id, item: x.item || 'Surplus', amount: x.amount, kind: 'surplus' }))
  return [...f, ...v, ...s]
})

// ── Investment routing (the reusable default; saving creates a new version) ──
// Local drafts, adopted from the active routing version while not dirty; an
// explicit "Save routing version" appends ONE version (no per-keystroke spam).
const invPools = computed(() => (body.value ? investmentPools(body.value) : { mf: 0, stocks: 0 }))
const invListOpen = ref({ mf: false, stocks: false })
const mfDraft = ref([])
const stockDraft = ref([])
const routingAdopt = ref(true)
const routingLabel = ref('')
const savingRouting = ref(false)
const sameRows = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
const routingDirty = computed(() => !sameRows(mfDraft.value, invPlan.mfRouting.value) || !sameRows(stockDraft.value, invPlan.stockRouting.value))
// Wait for the (async, app-wide) routing plan to load before adopting/disarming —
// otherwise the drafts seed [] pre-load and an explicit save would overwrite the
// real routing with [].
watch(() => [invPlan.loading.value, invPlan.mfRouting.value, invPlan.stockRouting.value], () => {
  if (invPlan.loading.value) return
  if (routingAdopt.value || !routingDirty.value) { mfDraft.value = clone(invPlan.mfRouting.value) || []; stockDraft.value = clone(invPlan.stockRouting.value) || []; routingAdopt.value = false }
}, { immediate: true, deep: true })
function onMfRouting(rows) { mfDraft.value = rows }
function onStockRouting(rows) { stockDraft.value = rows }
async function saveRoutingVersion() {
  if (savingRouting.value) return
  savingRouting.value = true
  routingAdopt.value = true
  try {
    await invPlan.saveRouting({ mfRouting: mfDraft.value, stockRouting: stockDraft.value, label: routingLabel.value.trim() || undefined })
    routingLabel.value = ''
    toast.success('Saved as a new routing version')
  }
  catch { routingAdopt.value = false; toast.error('Could not save investment routing') }
  finally { savingRouting.value = false }
}

// ── Derived (yearly) ──────────────────────────────────────────────────────
const yearlyRows = computed(() => (body.value ? [...(body.value.fixedExpenses || []), ...(body.value.variableExpenses || [])] : []))
const annualTotal = computed(() => sumMinor(yearlyRows.value.map((r) => r.amount)))
const monthlyStrip = computed(() => Array.from({ length: 12 }, (_, i) => sumMinor(yearlyRows.value.filter((r) => r.recurMonth === i + 1).map((r) => r.amount))))
const stripMax = computed(() => Math.max(1, ...monthlyStrip.value))

// ── To-dos (monthly) ──────────────────────────────────────────────────────
const todoDraft = ref('')
function addTodo() {
  const label = todoDraft.value.trim()
  if (!label) return
  body.value.todos.push({ id: newId(), label, isAuto: false, order: body.value.todos.length })
  todoDraft.value = ''
}
function removeTodo(id) {
  body.value.todos = body.value.todos.filter((t) => t.id !== id)
}

// ── Save ──────────────────────────────────────────────────────────────────
const saving = ref(false)
async function save() {
  if (saving.value || !body.value) return
  saving.value = true
  try {
    await plan.saveVersion({ ...body.value, currency: planCurrency.value })
    toast.success('Plan version saved')
    await navigateTo('/plan-designer')
  }
  catch {
    toast.error('Could not save the plan version')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="!body" class="space-y-4">
    <UiSkeleton class="h-8 w-48" />
    <UiSkeleton class="h-64 w-full" />
  </div>

  <div v-else class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{{ isMonthly ? 'Monthly' : 'Yearly' }} plan</h1>
        <p class="text-sm text-muted-foreground">
          Currency: <span class="font-medium text-foreground">{{ planCurrency }}</span> · saving creates a new version (history is kept).
        </p>
      </div>
      <UiButton variant="ghost" as-child><NuxtLink to="/plan-designer">Back</NuxtLink></UiButton>
    </div>

    <!-- Stepper -->
    <div class="flex flex-wrap gap-2">
      <button
        v-for="(label, i) in steps"
        :key="label"
        type="button"
        class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors"
        :class="i === step ? 'border-primary bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted'"
        @click="step = i"
      >
        <span class="flex size-5 items-center justify-center rounded-full text-xs" :class="i === step ? 'bg-primary text-primary-foreground' : 'bg-muted'">{{ i + 1 }}</span>
        {{ label }}
      </button>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <!-- Step content -->
      <div class="space-y-4 lg:col-span-2">
        <UiCard>
          <UiCardHeader>
            <UiCardTitle>{{ steps[step] }}</UiCardTitle>
          </UiCardHeader>
          <UiCardContent>
            <!-- MONTHLY -->
            <template v-if="isMonthly">
              <div v-if="step === 0" class="max-w-xs space-y-1.5">
                <UiLabel>Monthly income</UiLabel>
                <MoneyInput v-model="body.income" :currency="planCurrency" />
              </div>

              <EditableLineTable
                v-else-if="step === 1"
                v-model="body.fixedExpenses"
                :currency="planCurrency"
                add-label="Add fixed expense"
                item-placeholder="e.g. Rent, EMI, Subscriptions"
                empty-text="No fixed expenses yet."
              />

              <div v-else-if="step === 2" class="space-y-2">
                <p class="text-sm text-muted-foreground">
                  Tick <span class="font-medium text-foreground">Daily budget</span> for expenses you track day-to-day (groceries, fuel…). Their total becomes the month's daily-budget pool that your daily expenses draw down. Actual daily spending is logged later on the month's Daily page.
                </p>
                <EditableLineTable
                  v-model="body.variableExpenses"
                  :currency="planCurrency"
                  add-label="Add variable expense"
                  item-placeholder="e.g. Groceries, Fuel"
                  empty-text="No variable expenses yet."
                  :new-row="() => ({ isDailyBudget: false })"
                >
                  <template #extra="{ row, setRow }">
                    <label class="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                      <UiCheckbox :model-value="row.isDailyBudget" @update:model-value="setRow({ isDailyBudget: !!$event })" />
                      Daily budget
                    </label>
                  </template>
                </EditableLineTable>
              </div>

              <div v-else-if="step === 3" class="space-y-2">
                <p class="text-sm text-muted-foreground">
                  Allocate your surplus of
                  <MoneyValue :amount="surplusPool" :currency="planCurrency" variant="auto" class="font-medium" />.
                </p>
                <PercentSplitControl v-model="body.surplus" :currency="planCurrency" :surplus-pool="surplusPool" allow-routing />
              </div>

              <FlowMapper
                v-else-if="step === 4"
                v-model="body.flow"
                :sources="flowSources"
                :accounts="accounts"
                :currency="planCurrency"
                :income="body.income"
              />

              <div v-else-if="step === 5" class="space-y-5">
                <p class="text-sm text-muted-foreground">
                  Design how each pool routes into your funds & stocks. This is your reusable routing — new months start from it. Saving creates a new routing version (history is kept).
                </p>
                <div v-if="invPools.mf > 0 || mfDraft.length" class="space-y-2">
                  <div class="flex items-center gap-2 text-sm font-medium"><TrendingUpIcon class="size-4 text-[var(--invest)]" /> Mutual Funds <span class="text-muted-foreground">pool</span> <MoneyValue :amount="invPools.mf" :currency="planCurrency" variant="total" /></div>
                  <InvestmentFlowMapper :model-value="mfDraft" :pool="invPools.mf" :holdings="mutualFunds" :bucket-options="bucketNamesFor('mutualFund')" :currency="planCurrency" pool-key="mf" @update:model-value="onMfRouting" @edit-as-list="invListOpen.mf = true" />
                  <UiCollapsible v-model:open="invListOpen.mf">
                    <UiCollapsibleTrigger as-child><UiButton variant="ghost" size="sm" class="text-muted-foreground">{{ invListOpen.mf ? 'Hide list editor' : 'Edit as list' }}</UiButton></UiCollapsibleTrigger>
                    <UiCollapsibleContent class="pt-2"><BucketRoutingControl :model-value="mfDraft" :currency="planCurrency" :sample-pool="invPools.mf" :holdings="mutualFunds" :bucket-options="bucketNamesFor('mutualFund')" @update:model-value="onMfRouting" /></UiCollapsibleContent>
                  </UiCollapsible>
                </div>
                <div v-if="invPools.stocks > 0 || stockDraft.length" class="space-y-2">
                  <div class="flex items-center gap-2 text-sm font-medium"><TrendingUpIcon class="size-4 text-[var(--invest)]" /> Stocks <span class="text-muted-foreground">pool</span> <MoneyValue :amount="invPools.stocks" :currency="planCurrency" variant="total" /></div>
                  <InvestmentFlowMapper :model-value="stockDraft" :pool="invPools.stocks" :holdings="stocks" :bucket-options="bucketNamesFor('stock')" :currency="planCurrency" pool-key="stocks" @update:model-value="onStockRouting" @edit-as-list="invListOpen.stocks = true" />
                  <UiCollapsible v-model:open="invListOpen.stocks">
                    <UiCollapsibleTrigger as-child><UiButton variant="ghost" size="sm" class="text-muted-foreground">{{ invListOpen.stocks ? 'Hide list editor' : 'Edit as list' }}</UiButton></UiCollapsibleTrigger>
                    <UiCollapsibleContent class="pt-2"><BucketRoutingControl :model-value="stockDraft" :currency="planCurrency" :sample-pool="invPools.stocks" :holdings="stocks" :bucket-options="bucketNamesFor('stock')" @update:model-value="onStockRouting" /></UiCollapsibleContent>
                  </UiCollapsible>
                </div>
                <p v-if="invPools.mf === 0 && invPools.stocks === 0" class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  Route some surplus to <span class="font-medium">Mutual Funds</span> or <span class="font-medium">Stocks</span> in the Surplus step first, then design the routing here.
                </p>
                <div v-if="routingDirty" class="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                  <span class="mr-auto text-sm text-muted-foreground">Unsaved routing changes</span>
                  <UiInput v-model="routingLabel" placeholder="Label (optional)" class="h-9 w-44" />
                  <UiButton size="sm" :disabled="savingRouting" @click="saveRoutingVersion"><SaveIcon class="size-4" /> {{ savingRouting ? 'Saving…' : 'Save routing version' }}</UiButton>
                </div>
              </div>

              <div v-else-if="step === 6" class="space-y-3">
                <p class="text-sm text-muted-foreground">
                  Manual to-dos copied into each month. Transfer reminders are generated automatically when you materialize a month.
                </p>
                <ul v-if="body.todos.length" class="space-y-1">
                  <li v-for="t in body.todos" :key="t.id" class="flex items-center gap-2 rounded-md border bg-card p-2">
                    <span class="flex-1 text-sm">{{ t.label }}</span>
                    <UiButton variant="ghost" size="icon" class="size-7 text-muted-foreground hover:text-destructive" :aria-label="`Delete ${t.label}`" @click="removeTodo(t.id)">
                      <Trash2Icon class="size-3.5" />
                    </UiButton>
                  </li>
                </ul>
                <form class="flex items-center gap-2" @submit.prevent="addTodo">
                  <UiInput v-model="todoDraft" placeholder="Add a to-do…" class="flex-1" />
                  <UiButton type="submit" variant="outline" size="icon" :disabled="!todoDraft.trim()" aria-label="Add to-do">
                    <PlusIcon class="size-4" />
                  </UiButton>
                </form>
              </div>
            </template>

            <!-- YEARLY -->
            <template v-else>
              <EditableLineTable
                v-if="step === 0"
                v-model="body.fixedExpenses"
                :currency="planCurrency"
                add-label="Add yearly fixed expense"
                item-placeholder="e.g. Term insurance"
                empty-text="No yearly fixed expenses yet."
                :new-row="() => ({ recurMonth: 1, recurDay: 1 })"
              >
                <template #extra="{ row, setRow }">
                  <div class="flex items-center gap-1">
                    <UiSelect :model-value="String(row.recurMonth || 1)" @update:model-value="setRow({ recurMonth: Number($event) })">
                      <UiSelectTrigger class="w-[4.5rem]"><UiSelectValue /></UiSelectTrigger>
                      <UiSelectContent>
                        <UiSelectItem v-for="(m, i) in MONTH_NAMES" :key="m" :value="String(i + 1)">{{ m }}</UiSelectItem>
                      </UiSelectContent>
                    </UiSelect>
                    <UiInput type="number" min="1" max="31" class="w-16" :model-value="row.recurDay || 1" aria-label="Day of month" @update:model-value="setRow({ recurDay: Math.min(31, Math.max(1, Number($event) || 1)) })" />
                  </div>
                </template>
              </EditableLineTable>

              <EditableLineTable
                v-else
                v-model="body.variableExpenses"
                :currency="planCurrency"
                add-label="Add yearly variable expense"
                item-placeholder="e.g. Festival shopping"
                empty-text="No yearly variable expenses yet."
                :new-row="() => ({ recurMonth: 1, recurDay: 1 })"
              >
                <template #extra="{ row, setRow }">
                  <div class="flex items-center gap-1">
                    <UiSelect :model-value="String(row.recurMonth || 1)" @update:model-value="setRow({ recurMonth: Number($event) })">
                      <UiSelectTrigger class="w-[4.5rem]"><UiSelectValue /></UiSelectTrigger>
                      <UiSelectContent>
                        <UiSelectItem v-for="(m, i) in MONTH_NAMES" :key="m" :value="String(i + 1)">{{ m }}</UiSelectItem>
                      </UiSelectContent>
                    </UiSelect>
                    <UiInput type="number" min="1" max="31" class="w-16" :model-value="row.recurDay || 1" aria-label="Day of month" @update:model-value="setRow({ recurDay: Math.min(31, Math.max(1, Number($event) || 1)) })" />
                  </div>
                </template>
              </EditableLineTable>
            </template>
          </UiCardContent>
        </UiCard>

        <div class="flex items-center justify-between">
          <UiButton variant="outline" :disabled="isFirst" @click="prev"><ChevronLeftIcon class="size-4" /> Back</UiButton>
          <UiButton v-if="!isLast" @click="next">Next <ChevronRightIcon class="size-4" /></UiButton>
        </div>
      </div>

      <!-- Live summary -->
      <div class="lg:col-span-1">
        <div class="sticky top-20 space-y-4">
          <UiCard>
            <UiCardHeader><UiCardTitle class="text-base">Summary</UiCardTitle></UiCardHeader>
            <UiCardContent class="space-y-2 text-sm">
              <template v-if="isMonthly">
                <div class="flex items-center justify-between"><span class="text-muted-foreground">Income</span><MoneyValue :amount="body.income" :currency="planCurrency" /></div>
                <div class="flex items-center justify-between"><span class="text-muted-foreground">Fixed</span><MoneyValue :amount="sumFixed" :currency="planCurrency" /></div>
                <div class="flex items-center justify-between"><span class="text-muted-foreground">Variable</span><MoneyValue :amount="sumVariable" :currency="planCurrency" /></div>
                <UiSeparator />
                <div class="flex items-center justify-between"><span class="text-muted-foreground">Expenses</span><MoneyValue :amount="sumExpenses" :currency="planCurrency" variant="total" /></div>
                <div class="flex items-center justify-between"><span class="font-medium">Surplus</span><MoneyValue :amount="surplusPool" :currency="planCurrency" variant="auto" class="font-semibold" /></div>
              </template>
              <template v-else>
                <div class="flex items-center justify-between"><span class="text-muted-foreground">Annual total</span><MoneyValue :amount="annualTotal" :currency="planCurrency" variant="total" /></div>
                <div class="space-y-1 pt-1">
                  <p class="text-xs text-muted-foreground">Due by month</p>
                  <div class="flex items-end gap-1">
                    <div v-for="(amt, i) in monthlyStrip" :key="i" class="flex flex-1 flex-col items-center gap-1">
                      <div class="w-full rounded-t bg-primary/80" :style="{ height: `${Math.round((amt / stripMax) * 40) + (amt > 0 ? 4 : 0)}px` }" :title="MONTH_NAMES[i]" />
                      <span class="text-[9px] text-muted-foreground">{{ MONTH_NAMES[i][0] }}</span>
                    </div>
                  </div>
                </div>
              </template>
            </UiCardContent>
          </UiCard>

          <UiCard>
            <UiCardContent class="space-y-2 pt-6">
              <div class="space-y-1.5">
                <UiLabel for="version-label">Version label</UiLabel>
                <UiInput id="version-label" v-model="body.label" placeholder="e.g. 2026 plan" />
              </div>
              <UiButton class="w-full" :disabled="saving" @click="save">
                <SaveIcon class="size-4" /> {{ saving ? 'Saving…' : 'Save version' }}
              </UiButton>
            </UiCardContent>
          </UiCard>
        </div>
      </div>
    </div>
  </div>
</template>
