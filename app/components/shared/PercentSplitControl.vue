<script setup>
// Surplus split editor (§9, S5 step ④). Each row is PCT (% of surplus) or AMOUNT
// (fixed minor units). A routed row feeds an investment pool, OR — when `holdings`
// is supplied (month view) — goes DIRECTLY to one fund/stock. Direct rows carry a
// "Count as investment" switch (off = Parked: sent to the fund but tracked as saving).
import { ref, computed, watch } from 'vue'
import { PlusIcon, Trash2Icon, TrendingUpIcon, PiggyBankIcon } from '@lucide/vue'
import { newId } from '@/domain/ids.js'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  currency: { type: String, default: undefined },
  surplusPool: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  // extra fields for a newly-added row (e.g. () => ({ source: 'MANUAL' }))
  newRow: { type: Function, default: () => ({}) },
  // when true, each row can route its amount into an investment pool
  allowRouting: { type: Boolean, default: false },
  // active holdings (funds + stocks). When non-empty, enables DIRECT-to-holding routing.
  holdings: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const clone = (v) => JSON.parse(JSON.stringify(v ?? []))
const rows = ref(clone(props.modelValue))
watch(
  () => props.modelValue,
  (v) => {
    if (JSON.stringify(v ?? []) !== JSON.stringify(rows.value)) rows.value = clone(v)
  },
)
function commit() {
  rows.value.forEach((r, i) => { r.order = i })
  emit('update:modelValue', clone(rows.value))
}

const pool = computed(() => Math.max(0, props.surplusPool))
function resolved(row) {
  const v = Number(row.value) || 0
  return row.mode === 'PCT' ? Math.round((pool.value * v) / 100) : Math.round(v)
}

const pctAssigned = computed(() =>
  rows.value.filter((r) => r.mode === 'PCT').reduce((s, r) => s + (Number(r.value) || 0), 0),
)
const totalAllocated = computed(() => rows.value.reduce((s, r) => s + resolved(r), 0))
const remainingAmount = computed(() => props.surplusPool - totalAllocated.value)
const overPct = computed(() => pctAssigned.value > 100)

// ── Routing ───────────────────────────────────────────────────────────────────
const activeHoldings = computed(() => (props.holdings ?? []).filter((h) => h.active !== false))
const mfHoldings = computed(() => activeHoldings.value.filter((h) => h.kind === 'mutualFund'))
const stockHoldings = computed(() => activeHoldings.value.filter((h) => h.kind === 'stock'))
const holdingName = (id) => activeHoldings.value.find((h) => h.id === id)?.name ?? 'the holding'

const isParked = (r) => !!r.targetFundId && r.countAsInvestment === false
const isCounted = (r) => !!r.target && !isParked(r)

// Select value <-> (target, targetFundId).
const routeValue = (row) => (!row.target ? 'NONE' : row.targetFundId ? `H:${row.targetFundId}` : `POOL:${row.target}`)
function setRoute(id, val) {
  const r = rows.value.find((x) => x.id === id)
  if (!r) return
  if (val === 'NONE') { r.target = null; r.targetFundId = null }
  else if (val === 'POOL:MUTUAL_FUNDS') { r.target = 'MUTUAL_FUNDS'; r.targetFundId = null }
  else if (val === 'POOL:STOCKS') { r.target = 'STOCKS'; r.targetFundId = null }
  else if (val.startsWith('H:')) {
    const h = activeHoldings.value.find((x) => x.id === val.slice(2))
    if (h) { r.target = h.kind === 'stock' ? 'STOCKS' : 'MUTUAL_FUNDS'; r.targetFundId = h.id; if (r.countAsInvestment == null) r.countAsInvestment = true }
  }
  commit()
}
function routeHint(r) {
  if (r.targetFundId) {
    return isParked(r)
      ? `Parked in ${holdingName(r.targetFundId)} — sent to the fund but tracked as saving.`
      : `Goes directly to ${holdingName(r.targetFundId)} — tracked as investment.`
  }
  return `Feeds your ${r.target === 'STOCKS' ? 'Stocks' : 'Mutual Funds'} pool — spread across funds per your plan.`
}
const amountVariant = (r) => (isParked(r) ? 'positive' : r.target ? 'invest' : 'muted')

const hasRouting = computed(() => rows.value.some((r) => r.target))
const investedSum = computed(() => rows.value.reduce((s, r) => (isCounted(r) ? s + resolved(r) : s), 0))
const parkedSum = computed(() => rows.value.reduce((s, r) => (isParked(r) ? s + resolved(r) : s), 0))

function setField(id, key, val) {
  const r = rows.value.find((x) => x.id === id)
  if (!r) return
  r[key] = val
  commit()
}
function setMode(id, mode) {
  if (!mode) return // toggle-group can emit '' on deselect — ignore
  const r = rows.value.find((x) => x.id === id)
  if (!r) return
  r.mode = mode
  r.value = 0
  commit()
}
function addRow() {
  rows.value.push({ id: newId(), item: '', mode: 'PCT', value: 0, order: rows.value.length, ...props.newRow() })
  commit()
}
function removeRow(id) {
  rows.value = rows.value.filter((x) => x.id !== id)
  commit()
}
</script>

<template>
  <div class="space-y-2">
    <p v-if="rows.length === 0" class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
      No surplus splits yet. Add one to allocate your surplus.
    </p>

    <ul v-else class="space-y-2">
      <li
        v-for="row in rows"
        :key="row.id"
        class="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2"
      >
        <UiInput
          :model-value="row.item"
          placeholder="e.g. Savings"
          :disabled="disabled"
          class="min-w-0 flex-1"
          aria-label="Surplus item"
          @update:model-value="setField(row.id, 'item', $event)"
        />

        <ModeToggle :model-value="row.mode" :disabled="disabled" @update:model-value="setMode(row.id, $event)" />

        <div class="w-40 shrink-0">
          <PercentInput
            v-if="row.mode === 'PCT'"
            :model-value="row.value"
            :disabled="disabled"
            aria-label="Percent of surplus"
            @update:model-value="setField(row.id, 'value', $event)"
          />
          <MoneyInput
            v-else
            :model-value="row.value"
            :currency="currency"
            :disabled="disabled"
            @update:model-value="setField(row.id, 'value', $event)"
          />
        </div>

        <div class="w-24 shrink-0 text-right text-sm">
          <MoneyValue :amount="resolved(row)" :currency="currency" :variant="amountVariant(row)" />
        </div>

        <UiSelect
          v-if="allowRouting"
          :model-value="routeValue(row)"
          :disabled="disabled"
          @update:model-value="setRoute(row.id, $event)"
        >
          <UiSelectTrigger class="h-9 w-[170px] shrink-0" aria-label="Route this surplus">
            <UiSelectValue placeholder="Route to" />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem value="NONE">No routing</UiSelectItem>
            <UiSelectGroup>
              <UiSelectLabel>Pool — spread per plan</UiSelectLabel>
              <UiSelectItem value="POOL:MUTUAL_FUNDS">Mutual Funds</UiSelectItem>
              <UiSelectItem value="POOL:STOCKS">Stocks</UiSelectItem>
            </UiSelectGroup>
            <UiSelectGroup v-if="mfHoldings.length">
              <UiSelectLabel>Direct to a fund</UiSelectLabel>
              <UiSelectItem v-for="h in mfHoldings" :key="h.id" :value="`H:${h.id}`">{{ h.name }}</UiSelectItem>
            </UiSelectGroup>
            <UiSelectGroup v-if="stockHoldings.length">
              <UiSelectLabel>Direct to a stock</UiSelectLabel>
              <UiSelectItem v-for="h in stockHoldings" :key="h.id" :value="`H:${h.id}`">{{ h.name }}</UiSelectItem>
            </UiSelectGroup>
          </UiSelectContent>
        </UiSelect>

        <UiButton
          type="button"
          variant="ghost"
          size="icon"
          class="size-8 shrink-0 text-muted-foreground hover:text-destructive"
          :disabled="disabled"
          :aria-label="`Delete ${row.item || 'split'}`"
          @click="removeRow(row.id)"
        >
          <Trash2Icon class="size-4" />
        </UiButton>

        <!-- routed-row controls: count-as-investment switch (direct only) + hint -->
        <div v-if="allowRouting && row.target" class="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5">
          <span v-if="row.targetFundId" class="flex items-center gap-2 text-xs">
            <UiSwitch :model-value="row.countAsInvestment !== false" :disabled="disabled" aria-label="Count as investment" @update:model-value="setField(row.id, 'countAsInvestment', $event)" />
            <span :class="isParked(row) ? 'text-muted-foreground' : 'font-medium'">Count as investment</span>
          </span>
          <span class="flex items-center gap-1 text-xs text-muted-foreground">
            <PiggyBankIcon v-if="isParked(row)" class="size-3 text-positive" />
            <TrendingUpIcon v-else class="size-3 text-invest" />
            {{ routeHint(row) }}
          </span>
        </div>
      </li>
    </ul>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <UiButton type="button" variant="outline" size="sm" :disabled="disabled" @click="addRow">
        <PlusIcon class="size-4" /> Add split
      </UiButton>

      <div class="flex items-center gap-3 text-sm">
        <span :class="overPct ? 'text-negative font-medium' : 'text-muted-foreground'">
          {{ pctAssigned }}% assigned
        </span>
        <span class="text-muted-foreground">·</span>
        <span class="flex items-center gap-1 text-muted-foreground">
          Remaining
          <MoneyValue :amount="remainingAmount" :currency="currency" variant="auto" />
        </span>
      </div>
    </div>

    <div v-if="allowRouting && hasRouting" class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
      <span class="flex items-center gap-1.5 text-muted-foreground"><TrendingUpIcon class="size-4 text-invest" /> Routed:</span>
      <span class="flex items-center gap-1">Invested <MoneyValue :amount="investedSum" :currency="currency" variant="invest" /></span>
      <template v-if="parkedSum > 0">
        <span class="text-muted-foreground">·</span>
        <span class="flex items-center gap-1">Parked <MoneyValue :amount="parkedSum" :currency="currency" variant="positive" /></span>
      </template>
    </div>
  </div>
</template>
