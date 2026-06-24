<script setup>
// Surplus split editor (§9, S5 step ④). Each row is PCT (% of surplus) or AMOUNT
// (fixed minor units). Shows live resolved amounts, % assigned, and remaining /
// over against the surplus pool.
import { ref, computed, watch } from 'vue'
import { PlusIcon, Trash2Icon, TrendingUpIcon } from '@lucide/vue'
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

// Investment pool tallies (only meaningful when allowRouting).
const mfPool = computed(() => rows.value.filter((r) => r.target === 'MUTUAL_FUNDS').reduce((s, r) => s + resolved(r), 0))
const stocksPool = computed(() => rows.value.filter((r) => r.target === 'STOCKS').reduce((s, r) => s + resolved(r), 0))
const hasRouting = computed(() => rows.value.some((r) => r.target))
const targetLabel = (t) => (t === 'MUTUAL_FUNDS' ? 'Mutual Funds' : t === 'STOCKS' ? 'Stocks' : '')

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
          <MoneyValue :amount="resolved(row)" :currency="currency" variant="muted" />
        </div>

        <UiSelect
          v-if="allowRouting"
          :model-value="row.target || 'NONE'"
          :disabled="disabled"
          @update:model-value="setField(row.id, 'target', $event === 'NONE' ? null : $event)"
        >
          <UiSelectTrigger class="h-9 w-[150px] shrink-0" aria-label="Route to investments">
            <UiSelectValue placeholder="Route to" />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem value="NONE">No routing</UiSelectItem>
            <UiSelectItem value="MUTUAL_FUNDS">Mutual Funds</UiSelectItem>
            <UiSelectItem value="STOCKS">Stocks</UiSelectItem>
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

        <p v-if="allowRouting && row.target" class="flex w-full items-center gap-1 text-xs text-muted-foreground">
          <TrendingUpIcon class="size-3" /> Feeds your {{ targetLabel(row.target) }} pool — still transferred to its account, then invested.
        </p>
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

    <div v-if="allowRouting && hasRouting" class="flex flex-wrap items-center gap-3 rounded-md bg-primary/5 px-3 py-2 text-sm">
      <span class="flex items-center gap-1.5 text-muted-foreground"><TrendingUpIcon class="size-4 text-primary" /> Routed to investments:</span>
      <span class="flex items-center gap-1">Mutual Funds <MoneyValue :amount="mfPool" :currency="currency" variant="total" /></span>
      <span class="text-muted-foreground">·</span>
      <span class="flex items-center gap-1">Stocks <MoneyValue :amount="stocksPool" :currency="currency" variant="total" /></span>
    </div>
  </div>
</template>
