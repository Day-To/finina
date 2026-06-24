<script setup>
// Add / reorder / delete rows of { id, item, amount, ... } with a live total
// (§9). Reorder uses accessible up/down buttons. An optional #extra slot renders
// a per-row control (e.g. the daily-budget toggle for variable expenses).
import { ref, computed, watch } from 'vue'
import { PlusIcon, Trash2Icon, ChevronUpIcon, ChevronDownIcon } from '@lucide/vue'
import { newId } from '@/domain/ids.js'
import { sumMinor } from '@/domain/money.js'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  currency: { type: String, default: undefined },
  itemLabel: { type: String, default: 'Item' },
  amountLabel: { type: String, default: 'Amount' },
  addLabel: { type: String, default: 'Add row' },
  itemPlaceholder: { type: String, default: 'Description' },
  // factory for a new row's extra fields, e.g. () => ({ isDailyBudget: false })
  newRow: { type: Function, default: () => ({}) },
  disabled: { type: Boolean, default: false },
  showTotal: { type: Boolean, default: true },
  emptyText: { type: String, default: 'No rows yet.' },
})
const emit = defineEmits(['update:modelValue'])
const slots = defineSlots()

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

const total = computed(() => sumMinor(rows.value.map((r) => r.amount)))

function setItem(id, val) {
  const r = rows.value.find((x) => x.id === id)
  if (r) { r.item = val; commit() }
}
function setAmount(id, val) {
  const r = rows.value.find((x) => x.id === id)
  if (r) { r.amount = val; commit() }
}
function setRow(id, patch) {
  const r = rows.value.find((x) => x.id === id)
  if (r) { Object.assign(r, patch); commit() }
}
function addRow() {
  rows.value.push({ id: newId(), item: '', amount: 0, order: rows.value.length, ...props.newRow() })
  commit()
}
function removeRow(id) {
  rows.value = rows.value.filter((x) => x.id !== id)
  commit()
}
function move(index, dir) {
  const j = index + dir
  if (j < 0 || j >= rows.value.length) return
  const arr = rows.value
  ;[arr[index], arr[j]] = [arr[j], arr[index]]
  commit()
}

defineExpose({ addRow, setRow })
</script>

<template>
  <div class="space-y-2">
    <p v-if="rows.length === 0" class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
      {{ emptyText }}
    </p>

    <ul v-else class="space-y-2">
      <li
        v-for="(row, i) in rows"
        :key="row.id"
        class="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2 sm:flex-nowrap"
      >
        <div class="flex shrink-0 flex-col">
          <UiButton
            type="button"
            variant="ghost"
            size="icon"
            class="size-8"
            :disabled="disabled || i === 0"
            :aria-label="`Move ${row.item || 'row'} up`"
            @click="move(i, -1)"
          >
            <ChevronUpIcon class="size-3.5" />
          </UiButton>
          <UiButton
            type="button"
            variant="ghost"
            size="icon"
            class="size-8"
            :disabled="disabled || i === rows.length - 1"
            :aria-label="`Move ${row.item || 'row'} down`"
            @click="move(i, 1)"
          >
            <ChevronDownIcon class="size-3.5" />
          </UiButton>
        </div>

        <UiInput
          :model-value="row.item"
          :placeholder="itemPlaceholder"
          :disabled="disabled"
          class="min-w-0 flex-1"
          :aria-label="itemLabel"
          @update:model-value="setItem(row.id, $event)"
        />

        <div class="w-40 shrink-0">
          <MoneyInput
            :model-value="row.amount"
            :currency="currency"
            :disabled="disabled"
            @update:model-value="setAmount(row.id, $event)"
          />
        </div>

        <div v-if="slots.extra" class="shrink-0">
          <slot name="extra" :row="row" :set-row="(patch) => setRow(row.id, patch)" />
        </div>

        <UiButton
          type="button"
          variant="ghost"
          size="icon"
          class="size-10 shrink-0 text-muted-foreground hover:text-destructive"
          :disabled="disabled"
          :aria-label="`Delete ${row.item || 'row'}`"
          @click="removeRow(row.id)"
        >
          <Trash2Icon class="size-4" />
        </UiButton>
      </li>
    </ul>

    <div class="flex items-center justify-between gap-2">
      <UiButton type="button" variant="outline" size="sm" :disabled="disabled" @click="addRow">
        <PlusIcon class="size-4" /> {{ addLabel }}
      </UiButton>
      <div v-if="showTotal" class="flex items-center gap-2 text-sm">
        <span class="text-muted-foreground">Total</span>
        <MoneyValue :amount="total" :currency="currency" variant="total" />
      </div>
    </div>
  </div>
</template>
