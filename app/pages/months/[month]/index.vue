<script setup>
// S8 — Monthly View. Editable blocks (Income, Fixed, Variable★, Surplus,
// Transfers, Checklist) in the month's currency. Yearly-injected rows are
// marked 🗓. Re-sync from plan is explicit (diff → confirm). Deficit warns.
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { toast } from 'vue-sonner'
import { CalendarPlusIcon, FilePlusIcon, RefreshCwIcon, SaveIcon, ReceiptIcon, SparklesIcon, LayoutDashboardIcon, CalendarDaysIcon, WalletIcon, SlidersHorizontalIcon, TrendingUpIcon } from '@lucide/vue'
import { surplus, surplusAmounts, dailyBudget, accountTransfers, autoTransferTodos, investmentPools, investmentBreakdown, autoInvestmentTodos, totalExpenses, totalFixed, totalVariable } from '@/domain/calc/index.js'
import { newId } from '@/domain/ids.js'
import { formatMonthLabel } from '@/lib/dates.js'

definePageMeta({ key: (route) => route.fullPath })

const route = useRoute()
const monthIdParam = computed(() => route.params.month)
const { month, loading, exists, materializeFromPlans, createBlank, save, previewResync, applyResync } = useMonth(monthIdParam)
const { accounts, byId: accountsById } = useBankAccounts()
const { investments, mutualFunds, stocks, bucketNamesFor, archivedFundIds, pausedFundIds, loading: invLoading } = useInvestments()
const investmentPlanStore = useInvestmentPlan()
const { locale } = useSettings()

const clone = (v) => JSON.parse(JSON.stringify(v ?? null))

// Key-order-independent serialization. The saved doc is read back through the
// Zod converter, which reorders object keys — a plain JSON.stringify would then
// never match the draft even when the data is identical (perpetual "unsaved").
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}
// Dirty must reflect only what the USER edits — never the derived auto-todo
// labels, which syncAutoTodos regenerates from flow/pools/account-names (the
// latter load asynchronously). Comparing those labels made a freshly-loaded
// month read "unsaved". So compare income/expenses/surplus/flow/investments +
// the manual to-do rows + every item's done-state (keyed by its stable id),
// but NOT the auto labels.
function comparable(m) {
  if (!m) return ''
  const list = m.checklist ?? []
  const manualTodos = list.filter((c) => !c.isAuto).map((c) => ({ id: c.id, label: c.label })) // array order = position; `order` field is reindexed by the sync
  const done = {}
  for (const c of list) done[c.accountId || c.id] = !!c.isDone
  return stableStringify({
    income: m.income, fixedExpenses: m.fixedExpenses, variableExpenses: m.variableExpenses,
    surplus: m.surplus, flow: m.flow, investments: m.investments, manualTodos, done,
    notes: m.notes ?? '',
  })
}

const draft = ref(null)
const adoptNext = ref(false) // force-adopt the next snapshot (right after a save)
// `baseline` is the comparable() of the draft AFTER on-load auto-corrections
// settle (stripRoutedSources / syncAutoTodos). Dirty compares against it — never
// against the raw server doc — so those derived corrections never read as a user
// edit. Captured on every adopt (load + post-save); only real edits flip dirty.
const baseline = ref('')
const dirty = computed(() => !!(draft.value && month.value && comparable(draft.value) !== baseline.value))

function captureBaseline() { baseline.value = draft.value ? comparable(draft.value) : '' }

// Legacy months predate the frozen holdings snapshot. Freeze on load from the
// live registry restricted to referenced ids (resolved against the FULL registry
// so a since-archived referenced fund still freezes with its name). Members carry
// NO `archived` — their badge comes from the live archivedFundIds Set. Idempotent.
function backfillHoldings(m) {
  if (!m) return m
  const snap = m.investments?.holdings
  const hasRouting = (m.investments?.mf?.length || m.investments?.stocks?.length)
  // Frozen months (incl. intentionally-empty snapshots) are already authoritative.
  if (m.investments?.holdingsFrozen || (snap && snap.length) || !hasRouting) return m
  const allocRows = [...(m.investments.mf ?? []), ...(m.investments.stocks ?? [])]
  const fundIds = new Set(allocRows.filter((r) => r.kind === 'fund').map((r) => r.fundId))
  const buckets = new Set(allocRows.filter((r) => r.kind !== 'fund').map((r) => (r.bucket || '').trim()))
  const holdings = []
  for (const h of investments.value) {
    if (fundIds.has(h.id) || buckets.has((h.bucket || '').trim())) {
      holdings.push({ id: h.id, kind: h.kind, name: h.name ?? '', bucket: h.bucket ?? '', active: h.active !== false })
    }
  }
  return { ...m, investments: { mf: m.investments.mf ?? [], stocks: m.investments.stocks ?? [], holdings, holdingsFrozen: true } }
}

watch(month, (m) => {
  if (!m) { draft.value = null; baseline.value = ''; return }
  // Adopt incoming snapshots when we have no unsaved local edits, or when this
  // is the snapshot of a save we just made. Re-baseline after the watchers settle.
  if (adoptNext.value || !draft.value || !dirty.value) {
    draft.value = backfillHoldings(clone(m))
    adoptNext.value = false
    nextTick(captureBaseline)
  }
}, { immediate: true })

const currency = computed(() => draft.value?.currency)
const surplusPool = computed(() => (draft.value ? surplus(draft.value) : 0))
const dailyBudgetPool = computed(() => (draft.value ? dailyBudget(draft.value) : 0))
const isDeficit = computed(() => surplusPool.value < 0)

// Top summary strip (Income · Expenses · Investment · Surplus) — mirrors the sheet.
const expensesTotal = computed(() => (draft.value ? totalExpenses(draft.value) : 0))
const investmentTotal = computed(() => pools.value.mf + pools.value.stocks)
const pctOfIncome = (v) => (draft.value?.income ? Math.round((v / draft.value.income) * 1000) / 10 : 0)
const flowSources = computed(() => {
  if (!draft.value) return []
  const f = (draft.value.fixedExpenses || []).map((l) => ({ id: l.id, item: l.item || 'Fixed item', amount: l.amount, kind: 'expense' }))
  const v = (draft.value.variableExpenses || []).map((l) => ({ id: l.id, item: l.item || 'Variable item', amount: l.amount, kind: 'expense' }))
  // Investment-routed surplus still flows to a bank account (then out to funds),
  // so it stays an assignable source in the flow.
  const s = surplusAmounts(draft.value).map((x) => ({ id: x.id, item: x.item || 'Surplus', amount: x.amount, kind: 'surplus' }))
  return [...f, ...v, ...s]
})

// Investment pools + the per-fund/stock breakdown for this month.
const pools = computed(() => (draft.value ? investmentPools(draft.value) : { mf: 0, stocks: 0 }))
const hasInvestments = computed(() => pools.value.mf > 0 || pools.value.stocks > 0)
const invBreakdown = computed(() => (draft.value ? investmentBreakdown(draft.value, investments.value) : null))
const invListOpen = ref({ mf: false, stocks: false }) // per-pool "Edit as list" disclosure

// Editors distribute over the month's FROZEN holdings snapshot (past-invariant);
// blank/no-snapshot months fall back to the live ACTIVE registry so routing can
// still be built.
const monthHoldings = (kind) => (draft.value?.investments?.holdings ?? []).filter((h) => h.kind === kind)
const editorHoldings = (kind) => {
  const snap = monthHoldings(kind)
  if (snap.length) return snap
  return kind === 'mutualFund' ? mutualFunds.value : stocks.value
}

// Per-type investment cards (only the types with a non-zero pool this month).
const invTypes = computed(() => [
  { key: 'mf', kind: 'mutualFund', label: 'Mutual Funds', accent: 'var(--positive)', route: 'mutual-funds', pool: pools.value.mf, breakdown: invBreakdown.value?.mf },
  { key: 'stocks', kind: 'stock', label: 'Stocks', accent: 'var(--chart-4)', route: 'stocks', pool: pools.value.stocks, breakdown: invBreakdown.value?.stocks },
].filter((t) => t.pool > 0))

// Checklist completion (display only — never feeds dirty/comparable).
const checklistProgress = computed(() => {
  const list = draft.value?.checklist ?? []
  const done = list.filter((c) => c.isDone).length
  return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 }
})

// Re-pull one investment type's routing from the reusable plan (fresh ids),
// discarding this month's manual tweaks for that type.
function resetInvestmentToPlan(key) {
  if (!draft.value) return
  const src = key === 'mf' ? investmentPlanStore.mfRouting.value : investmentPlanStore.stockRouting.value
  const rows = src.map((r, i) => ({ ...JSON.parse(JSON.stringify(r)), id: newId(), order: i }))
  // Spread preserves the existing frozen `holdings`; the [] is only a default for
  // a legacy/blank draft lacking the key. Routing-only — does NOT refresh the snapshot.
  const investments = { mf: [], stocks: [], holdings: [], holdingsFrozen: true, ...draft.value.investments, [key]: rows }
  draft.value = { ...draft.value, investments }
}

// Keep the auto-generated "Transfer X to <bank>" checklist items in sync with
// the live flow: regenerate them whenever the per-account transfer amounts (or
// account names) change, preserving manual items and each auto item's done-state.
const transferSignature = computed(() => {
  if (!draft.value) return ''
  return [...accountTransfers(draft.value)]
    .map(([accId, amt]) => `${accId}:${amt}:${accountsById.value.get(accId)?.name ?? ''}`)
    .sort()
    .join('|')
})

const autoSig = (list) => JSON.stringify((list ?? []).map((c) => ({ l: c.label, d: c.isDone, a: c.isAuto, acc: c.accountId ?? null })))

// Single pass that regenerates BOTH transfer ("Transfer X to <bank>") and
// investment ("Make X investment") auto items, preserving manual items and each
// auto item's done-state (keyed by accountId — bank UUIDs / inv:mf / inv:stocks).
function syncAutoTodos() {
  const m = draft.value
  if (!m) return
  const cur = m.checklist ?? []
  const manual = cur.filter((c) => !c.isAuto)
  const prevAuto = new Map(cur.filter((c) => c.isAuto && c.accountId).map((c) => [c.accountId, c]))
  const reuse = (t) => {
    const prev = prevAuto.get(t.accountId)
    return { id: prev?.id ?? t.id, label: t.label, isDone: prev?.isDone ?? false, isAuto: true, accountId: t.accountId ?? null, order: 0 }
  }
  const transferAutos = autoTransferTodos(m, m.currency, accountsById.value).map(reuse)
  const investmentAutos = autoInvestmentTodos(m, m.currency).map(reuse)
  const next = [...manual, ...transferAutos, ...investmentAutos].map((c, i) => ({ ...c, order: i }))
  if (autoSig(next) !== autoSig(cur)) draft.value = { ...m, checklist: next }
}

watch([transferSignature, () => `${pools.value.mf}:${pools.value.stocks}`], syncAutoTodos)

// ── Actions ─────────────────────────────────────────────────────────────────
const busy = ref(false)
async function generate() {
  busy.value = true
  try {
    await materializeFromPlans()
    toast.success('Month generated from your active plan')
  }
  catch (e) {
    toast.error(/No active/.test(e?.message) ? 'No active monthly plan yet — create one first.' : 'Could not generate this month')
  }
  finally { busy.value = false }
}
async function blank() {
  busy.value = true
  try {
    await createBlank()
    toast.success('Blank month created')
  }
  catch { toast.error('Could not create month') }
  finally { busy.value = false }
}

const saving = ref(false)
async function saveChanges() {
  if (!draft.value || saving.value) return
  saving.value = true
  adoptNext.value = true // adopt the read-back snapshot so dirty clears cleanly
  try {
    await save(draft.value)
    toast.success('Changes saved')
  }
  catch {
    adoptNext.value = false
    toast.error('Could not save changes')
  }
  finally { saving.value = false }
}

function goMonth(id) { navigateTo(`/months/${id}`) }

// ── Start month (guided ritual) ───────────────────────────────────────────────
const startMonthOpen = ref(false)
async function onStartMonthComplete(checklist) {
  if (!draft.value) return
  draft.value = { ...draft.value, checklist }
  await saveChanges()
}

// ── Unsaved-changes guard ─────────────────────────────────────────────────────
onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  return window.confirm('You have unsaved changes to this month. Leave without saving?')
})
function onBeforeUnload(e) {
  if (dirty.value) { e.preventDefault(); e.returnValue = '' }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

// ── Re-sync ─────────────────────────────────────────────────────────────────
const resync = ref({ open: false, next: null, diff: null, busy: false })
async function openResync() {
  try {
    const { next, diff } = await previewResync()
    resync.value = { open: true, next, diff, busy: false }
  }
  catch (e) {
    toast.error(/No active/.test(e?.message) ? 'No active monthly plan to re-sync from' : 'Could not prepare re-sync')
  }
}
async function confirmResync() {
  resync.value.busy = true
  try {
    await applyResync(resync.value.next)
    draft.value = null // force adopt the new snapshot
    toast.success('Re-synced from your plan')
    resync.value.open = false
  }
  catch { toast.error('Could not re-sync') }
  finally { resync.value.busy = false }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <h1 class="truncate text-2xl font-semibold tracking-tight">{{ formatMonthLabel(monthIdParam, locale) }}</h1>
          <p class="text-sm text-muted-foreground">Your editable plan for this month.</p>
        </div>
        <MonthSwitcher :model-value="monthIdParam" class="shrink-0" @update:model-value="goMonth" />
      </div>
      <div class="flex flex-wrap items-center gap-2 sm:justify-end">
        <UiButton v-if="exists" class="flex-1 sm:flex-none" @click="startMonthOpen = true"><SparklesIcon class="size-4" /> Start month</UiButton>
        <UiButton v-if="exists" variant="outline" class="flex-1 sm:flex-none" as-child>
          <NuxtLink :to="`/months/${monthIdParam}/daily`">Daily</NuxtLink>
        </UiButton>
        <UiButton variant="outline" class="flex-1 sm:flex-none" :disabled="busy || invLoading" @click="openResync"><RefreshCwIcon class="size-4" /> Re-sync</UiButton>
      </div>
    </div>

    <StartMonthDialog
      v-model:open="startMonthOpen"
      :month="draft"
      :month-label="formatMonthLabel(monthIdParam, locale)"
      :accounts-by-id="accountsById"
      :registry="investments"
      @complete="onStartMonthComplete"
    />

    <!-- Loading -->
    <div v-if="loading && !draft" class="space-y-4">
      <UiSkeleton class="h-32 w-full" />
      <UiSkeleton class="h-64 w-full" />
    </div>

    <!-- Not set up -->
    <UiCard v-else-if="!exists">
      <UiCardHeader>
        <UiCardTitle>This month isn’t set up yet</UiCardTitle>
        <UiCardDescription>Generate it from your active monthly plan (plus any yearly items due), or start blank.</UiCardDescription>
      </UiCardHeader>
      <UiCardFooter class="flex flex-wrap gap-2">
        <UiButton :disabled="busy || invLoading" @click="generate"><CalendarPlusIcon class="size-4" /> Generate from plan</UiButton>
        <UiButton variant="outline" :disabled="busy" @click="blank"><FilePlusIcon class="size-4" /> Blank month</UiButton>
      </UiCardFooter>
    </UiCard>

    <!-- Dashboard -->
    <template v-else-if="draft">
      <!-- Overview — KPI tiles -->
      <section class="space-y-4 border-t pt-8">
        <div class="flex items-center gap-2.5">
          <LayoutDashboardIcon class="size-4 text-primary" />
          <h2 class="text-sm font-semibold tracking-tight">Overview</h2>
        </div>
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Income" class="border-t-2 border-t-auto" hint="this month">
            <MoneyValue :amount="draft.income ?? 0" :currency="currency" />
          </StatTile>
          <StatTile label="Expenses" class="border-t-2 border-t-negative" :hint="`${pctOfIncome(expensesTotal)}% of income`" hint-variant="negative">
            <MoneyValue :amount="expensesTotal" :currency="currency" variant="negative" />
          </StatTile>
          <StatTile label="Investment" class="border-t-2 border-t-positive" :hint="`${pctOfIncome(investmentTotal)}% of income`" hint-variant="positive">
            <MoneyValue :amount="investmentTotal" :currency="currency" variant="positive" />
          </StatTile>
          <StatTile label="Surplus" class="border-t-2 border-t-amber-500" :hint="isDeficit ? 'deficit' : 'kept this month'" :hint-variant="isDeficit ? 'negative' : 'positive'">
            <MoneyValue :amount="surplusPool" :currency="currency" variant="auto" />
          </StatTile>
        </div>
        <div v-if="isDeficit" class="flex items-center gap-2 rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative">
          <span class="font-medium">Deficit:</span>
          your expenses exceed income by <MoneyValue :amount="Math.abs(surplusPool)" :currency="currency" />.
        </div>
      </section>

      <!-- Money flow — full end-to-end map (opens full-screen) -->
      <section class="border-t pt-8">
        <MoneyFlowView
          :month="draft"
          :accounts="accounts"
          :accounts-by-id="accountsById"
          :registry="investments"
          :currency="currency"
          :archived-fund-ids="archivedFundIds"
          :paused-fund-ids="pausedFundIds"
        />
      </section>

      <!-- This month — income + notes + daily spending (left), checklist (right) -->
      <section class="space-y-4 border-t pt-8">
        <div class="flex items-center gap-2.5">
          <CalendarDaysIcon class="size-4 text-primary" />
          <h2 class="text-sm font-semibold tracking-tight">This month</h2>
        </div>
        <div class="grid items-start gap-4 lg:grid-cols-2">
          <div class="space-y-4">
            <UiCard>
              <UiCardHeader><UiCardTitle class="text-base">Income</UiCardTitle></UiCardHeader>
              <UiCardContent>
                <div class="max-w-xs"><MoneyInput v-model="draft.income" :currency="currency" /></div>
              </UiCardContent>
            </UiCard>

            <UiCard>
              <UiCardHeader>
                <UiCardTitle class="text-base">Notes</UiCardTitle>
              </UiCardHeader>
              <UiCardContent>
                <UiTextarea v-model="draft.notes" placeholder="e.g. One-off bonus this month, postponed the wedding fund transfer…" rows="4" />
              </UiCardContent>
            </UiCard>

            <UiCard class="border-primary/30 bg-primary/5">
              <UiCardContent class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <div class="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <ReceiptIcon class="size-4" />
                  </div>
                  <div class="text-sm">
                    <p class="font-medium">Daily spending</p>
                    <p class="text-muted-foreground">
                      Daily budget pool <MoneyValue :amount="dailyBudgetPool" :currency="currency" variant="total" /> — log day-to-day expenses here.
                    </p>
                  </div>
                </div>
                <UiButton as-child>
                  <NuxtLink :to="`/months/${monthIdParam}/daily`"><ReceiptIcon class="size-4" /> Log daily expenses</NuxtLink>
                </UiButton>
              </UiCardContent>
            </UiCard>
          </div>

          <UiCard>
            <UiCardHeader>
              <div class="flex items-center justify-between gap-3">
                <UiCardTitle class="text-base">Checklist</UiCardTitle>
                <div v-if="checklistProgress.total" class="flex items-center gap-2">
                  <div class="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                    <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${checklistProgress.pct}%` }" />
                  </div>
                  <span class="whitespace-nowrap text-xs text-muted-foreground">{{ checklistProgress.done }} of {{ checklistProgress.total }} done</span>
                </div>
              </div>
            </UiCardHeader>
            <UiCardContent>
              <Checklist v-model="draft.checklist" />
            </UiCardContent>
          </UiCard>
        </div>
      </section>

      <!-- Expenditure — fixed + variable expense editors -->
      <section class="space-y-4 border-t pt-8">
        <div class="space-y-1">
          <div class="flex items-center gap-2.5">
            <WalletIcon class="size-4 text-primary" />
            <h2 class="text-sm font-semibold tracking-tight">Expenditure</h2>
          </div>
          <p class="text-sm text-muted-foreground">Your fixed and variable expenses for the month.</p>
        </div>
        <div class="grid items-start gap-4 md:grid-cols-2">
          <UiCard>
            <UiCardHeader>
              <div class="flex items-center justify-between gap-2">
                <UiCardTitle class="text-base">Fixed expenses</UiCardTitle>
                <MoneyValue :amount="totalFixed(draft)" :currency="currency" variant="muted" class="text-sm" />
              </div>
            </UiCardHeader>
            <UiCardContent>
              <EditableLineTable v-model="draft.fixedExpenses" :currency="currency" add-label="Add fixed expense" empty-text="No fixed expenses." :show-total="false" :new-row="() => ({ source: 'MANUAL' })">
                <template #extra="{ row }">
                  <UiBadge v-if="row.source === 'YEARLY'" variant="outline" class="text-[10px]" title="From yearly plan">🗓</UiBadge>
                </template>
              </EditableLineTable>
            </UiCardContent>
          </UiCard>

          <UiCard>
            <UiCardHeader>
              <div class="flex items-center justify-between gap-2">
                <UiCardTitle class="text-base">Variable expenses</UiCardTitle>
                <MoneyValue :amount="totalVariable(draft)" :currency="currency" variant="muted" class="text-sm" />
              </div>
            </UiCardHeader>
            <UiCardContent>
              <EditableLineTable v-model="draft.variableExpenses" :currency="currency" add-label="Add variable expense" empty-text="No variable expenses." :show-total="false" :new-row="() => ({ isDailyBudget: false, source: 'MANUAL' })">
                <template #extra="{ row, setRow }">
                  <div class="flex items-center gap-2">
                    <UiBadge v-if="row.source === 'YEARLY'" variant="outline" class="text-[10px]" title="From yearly plan">🗓</UiBadge>
                    <label class="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                      <UiCheckbox :model-value="row.isDailyBudget" @update:model-value="setRow({ isDailyBudget: !!$event })" /> Daily
                    </label>
                  </div>
                </template>
              </EditableLineTable>
            </UiCardContent>
          </UiCard>
        </div>
      </section>

      <!-- Plan & edit — the editable numbers -->
      <section class="space-y-4 border-t pt-8">
        <div class="space-y-1">
          <div class="flex items-center gap-2.5">
            <SlidersHorizontalIcon class="size-4 text-primary" />
            <h2 class="text-sm font-semibold tracking-tight">Plan &amp; edit</h2>
          </div>
          <p class="text-sm text-muted-foreground">Adjust this month’s numbers.</p>
        </div>

        <UiCard>
          <UiCardHeader>
            <UiCardTitle class="text-base">Surplus split</UiCardTitle>
            <UiCardDescription>Allocating a surplus of <MoneyValue :amount="surplusPool" :currency="currency" variant="auto" />.</UiCardDescription>
          </UiCardHeader>
          <UiCardContent>
            <PercentSplitControl v-model="draft.surplus" :currency="currency" :surplus-pool="surplusPool" :new-row="() => ({ source: 'MANUAL' })" allow-routing />
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader>
            <UiCardTitle class="text-base">Transfers</UiCardTitle>
            <UiCardDescription>Assign each income, expense and surplus line to a bank account.</UiCardDescription>
          </UiCardHeader>
          <UiCardContent>
            <FlowMapper v-model="draft.flow" :sources="flowSources" :accounts="accounts" :currency="currency" :income="draft.income" />
          </UiCardContent>
        </UiCard>

      </section>

      <!-- Investments — one segregated, colour-coded card per type -->
      <section v-if="hasInvestments" class="space-y-4 border-t pt-8">
        <div class="space-y-1">
          <div class="flex items-center gap-2.5">
            <TrendingUpIcon class="size-4 text-primary" />
            <h2 class="text-sm font-semibold tracking-tight">Investments</h2>
          </div>
          <p class="text-sm text-muted-foreground">Routing this month’s surplus into your funds and stocks.</p>
        </div>
        <div class="grid items-start gap-4" :class="invTypes.length > 1 && 'lg:grid-cols-2'">
          <InvestmentTypeCard
            v-for="t in invTypes" :key="t.key"
            v-model="draft.investments[t.key]"
            :pool-key="t.key"
            :kind="t.kind"
            :label="t.label"
            :accent="t.accent"
            :route="t.route"
            :pool="t.pool"
            :pct="pctOfIncome(t.pool)"
            :breakdown="t.breakdown"
            :currency="currency"
            :holdings="editorHoldings(t.kind)"
            :bucket-options="bucketNamesFor(t.kind)"
            :archived-fund-ids="archivedFundIds"
            :paused-fund-ids="pausedFundIds"
            :list-open="invListOpen[t.key]"
            @update:list-open="invListOpen[t.key] = $event"
            @reset="resetInvestmentToPlan(t.key)"
          />
        </div>
      </section>
    </template>

    <!-- Sticky save bar -->
    <div v-if="exists && draft" class="sticky bottom-20 z-10 flex justify-end md:bottom-4">
      <div class="flex items-center gap-3 rounded-full border bg-background/95 px-4 py-2 shadow-lg backdrop-blur">
        <span class="text-xs text-muted-foreground">{{ dirty ? 'Unsaved changes' : 'All changes saved' }}</span>
        <UiButton size="sm" :disabled="!dirty || saving" @click="saveChanges">
          <SaveIcon class="size-4" /> {{ saving ? 'Saving…' : 'Save' }}
        </UiButton>
      </div>
    </div>

    <!-- Re-sync confirm -->
    <UiAlertDialog v-model:open="resync.open">
      <UiAlertDialogContent>
        <UiAlertDialogHeader>
          <UiAlertDialogTitle>Re-sync from your plan?</UiAlertDialogTitle>
          <UiAlertDialogDescription>
            This replaces plan-sourced income, fixed, variable, surplus, flow and investment routing with your active plan. Your manually-added rows and checklist progress are kept.
          </UiAlertDialogDescription>
        </UiAlertDialogHeader>
        <div v-if="resync.diff" class="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
          <p>Fixed rows: {{ resync.diff.fixedBefore }} → {{ resync.diff.fixedAfter }}</p>
          <p>Variable rows: {{ resync.diff.variableBefore }} → {{ resync.diff.variableAfter }}</p>
          <p>Investment routing: {{ resync.diff.investmentBefore }} → {{ resync.diff.investmentAfter }} allocation(s)</p>
          <p>Holdings snapshot: {{ resync.diff.holdingsBefore }} → {{ resync.diff.holdingsAfter }}<span v-if="resync.diff.holdingsDropped"> ({{ resync.diff.holdingsDropped }} no longer active)</span></p>
          <p v-if="resync.diff.holdingsDropped" class="text-muted-foreground">Re-syncing rebuilds this month from your current funds — any fund archived since you created it drops off this month's split. Past months you don't re-sync keep showing it.</p>
          <p v-if="resync.diff.incomeChanged" class="text-muted-foreground">Income will change.</p>
          <p v-if="resync.diff.manualPreserved" class="text-muted-foreground">{{ resync.diff.manualPreserved }} manual row(s) preserved.</p>
        </div>
        <UiAlertDialogFooter>
          <UiAlertDialogCancel :disabled="resync.busy">Cancel</UiAlertDialogCancel>
          <UiAlertDialogAction :disabled="resync.busy" @click="confirmResync">{{ resync.busy ? 'Re-syncing…' : 'Re-sync' }}</UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>
  </div>
</template>
