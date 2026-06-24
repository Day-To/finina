<script setup>
// List fallback for the investment routing (the node editor is primary). Each
// row is a bucket (→ its funds by per-fund %) or a single fund (→ directly).
// Controlled v-model over the routing array; the parent owns save/dirty.
import { ref, computed, watch } from 'vue'
import { PlusIcon, Trash2Icon, ChevronRightIcon, AlertTriangleIcon, CoinsIcon, Wand2Icon } from '@lucide/vue'
import { newId } from '@/domain/ids.js'
import { deriveInvestment } from '@/composables/useInvestmentFlow.js'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  currency: { type: String, default: undefined },
  samplePool: { type: Number, default: 0 },
  holdings: { type: Array, default: () => [] },
  bucketOptions: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  archivedFundIds: { type: Object, default: () => new Set() },
  pausedFundIds: { type: Object, default: () => new Set() },
})
const emit = defineEmits(['update:modelValue'])

const clone = (v) => JSON.parse(JSON.stringify(v ?? []))
const rows = ref(clone(props.modelValue))
watch(() => props.modelValue, (v) => { if (JSON.stringify(v ?? []) !== JSON.stringify(rows.value)) rows.value = clone(v) })
function commit() { rows.value.forEach((r, i) => { r.order = i }); emit('update:modelValue', clone(rows.value)) }

const derived = computed(() => deriveInvestment(props.samplePool, rows.value, props.holdings))
const amountFor = (id) => derived.value.rows.find((r) => r.id === id)?.amount ?? 0
const leavesFor = (id) => derived.value.holdings.filter((h) => h.allocId === id)
const fundName = (fid) => props.holdings.find((h) => h.id === fid)?.name ?? '(fund removed)'
const rawPctOf = (row, fundId) => row.funds?.find((f) => f.fundId === fundId)?.pct ?? null

// Pickable = present, not paused, not live-archived. leavesFor/fundName keep
// resolving archived members so a past month's split still shows them (badged).
const pickableHoldings = computed(() => props.holdings.filter((h) => h.active !== false && !props.archivedFundIds.has(h.id)))
const soloFundIds = computed(() => new Set(rows.value.filter((r) => r.kind === 'fund').map((r) => r.fundId)))
const availableFunds = computed(() => pickableHoldings.value.filter((h) => !soloFundIds.value.has(h.id)))
const placedBuckets = computed(() => new Set(rows.value.filter((r) => r.kind === 'bucket').map((r) => (r.bucket || '').trim())))
const unallocatedBuckets = computed(() => props.bucketOptions.filter((b) => b && !placedBuckets.value.has(b)))

const pctAssigned = computed(() => rows.value.filter((r) => r.mode === 'PCT').reduce((s, r) => s + (Number(r.value) || 0), 0))
const overPct = computed(() => pctAssigned.value > 100)
const variablePool = computed(() => Math.max(0, props.samplePool - derived.value.fixedTotal))

const expanded = ref(new Set())
function toggleExpand(id) { const n = new Set(expanded.value); n.has(id) ? n.delete(id) : n.add(id); expanded.value = n }
const addFundOpen = ref(false)

const rowById = (id) => rows.value.find((r) => r.id === id)
function setField(id, key, val) { const r = rowById(id); if (r) { r[key] = val; commit() } }
function setMode(id, mode) { if (!mode) return; const r = rowById(id); if (r) { r.mode = mode; r.value = 0; commit() } }
function addBucket(bucket = '') { rows.value.push({ id: newId(), kind: 'bucket', bucket, mode: 'PCT', value: 0, funds: [], order: rows.value.length }); commit() }
function addSingleFund(fundId) { rows.value.push({ id: newId(), kind: 'fund', fundId, mode: 'PCT', value: 0, order: rows.value.length }); commit(); addFundOpen.value = false }
function removeRow(id) { rows.value = rows.value.filter((r) => r.id !== id); commit() }
function setFundPct(id, fundId, pct) {
  const r = rowById(id)
  if (!r) return
  if (!r.funds) r.funds = []
  const i = r.funds.findIndex((f) => f.fundId === fundId)
  if (i >= 0) r.funds[i].pct = pct
  else r.funds.push({ fundId, pct })
  commit()
}
function distributeEvenly(id) {
  const r = rowById(id)
  if (!r) return
  const ids = leavesFor(id).map((l) => l.fundId)
  const pct = ids.length ? Math.round(100 / ids.length) : 0
  r.funds = ids.map((fundId) => ({ fundId, pct }))
  commit()
}
</script>

<template>
  <div class="space-y-2">
    <p v-if="rows.length === 0" class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
      No routing yet. Add a bucket or a single fund to route this pool.
    </p>

    <ul v-else class="space-y-2">
      <li v-for="row in rows" :key="row.id" class="rounded-md border bg-card">
        <div class="flex flex-wrap items-center gap-2 p-2">
          <div class="flex min-w-40 flex-1 items-center gap-2">
            <CoinsIcon v-if="row.kind === 'fund'" class="size-4 shrink-0 text-positive" />
            <span v-if="row.kind === 'fund'" class="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
              <span class="truncate">{{ fundName(row.fundId) }}</span>
              <UiBadge v-if="archivedFundIds.has(row.fundId)" variant="outline" class="shrink-0 text-muted-foreground">Archived</UiBadge>
              <span v-else-if="pausedFundIds.has(row.fundId)" class="shrink-0 text-[11px] text-muted-foreground">paused</span>
            </span>
            <BucketCombobox v-else :model-value="row.bucket" :options="bucketOptions" :disabled="disabled" placeholder="Bucket" @update:model-value="setField(row.id, 'bucket', $event)" />
          </div>

          <ModeToggle :model-value="row.mode" :disabled="disabled" @update:model-value="setMode(row.id, $event)" />

          <div class="w-40 shrink-0">
            <PercentInput v-if="row.mode === 'PCT'" :model-value="row.value" :disabled="disabled" aria-label="Percent of pool" @update:model-value="setField(row.id, 'value', $event)" />
            <MoneyInput v-else :model-value="row.value" :currency="currency" :disabled="disabled" @update:model-value="setField(row.id, 'value', $event)" />
          </div>

          <div class="w-24 shrink-0 text-right text-sm"><MoneyValue :amount="amountFor(row.id)" :currency="currency" variant="muted" /></div>

          <UiButton v-if="row.kind === 'bucket'" type="button" variant="ghost" size="icon" class="size-8 shrink-0 text-muted-foreground" :aria-label="`Show funds in ${row.bucket || 'bucket'}`" :aria-expanded="expanded.has(row.id)" @click="toggleExpand(row.id)">
            <ChevronRightIcon class="size-4 transition-transform" :class="expanded.has(row.id) && 'rotate-90'" />
          </UiButton>
          <UiButton type="button" variant="ghost" size="icon" class="size-8 shrink-0 text-muted-foreground hover:text-destructive" :disabled="disabled" :aria-label="`Delete ${row.kind === 'fund' ? fundName(row.fundId) : row.bucket || 'allocation'}`" @click="removeRow(row.id)">
            <Trash2Icon class="size-4" />
          </UiButton>
        </div>

        <div v-if="row.kind === 'bucket' && expanded.has(row.id)" class="space-y-1 border-t px-3 py-2">
          <p v-if="!leavesFor(row.id).length" class="text-xs text-amber-600 dark:text-amber-400">No funds in this bucket — set a fund's bucket to “{{ row.bucket }}”.</p>
          <div v-for="leaf in leavesFor(row.id)" :key="leaf.fundId" class="flex items-center gap-2 text-sm">
            <span class="flex min-w-0 flex-1 items-center gap-1.5">
              <span class="truncate">{{ leaf.name }}</span>
              <UiBadge v-if="archivedFundIds.has(leaf.id)" variant="outline" class="shrink-0 text-muted-foreground">Archived</UiBadge>
              <span v-else-if="pausedFundIds.has(leaf.id)" class="shrink-0 text-[11px] text-muted-foreground">paused</span>
            </span>
            <div class="w-24 shrink-0"><PercentInput :model-value="rawPctOf(row, leaf.fundId) ?? 0" :disabled="disabled" aria-label="Share of bucket" @update:model-value="setFundPct(row.id, leaf.fundId, $event)" /></div>
            <span class="w-10 shrink-0 text-right text-[11px] text-muted-foreground">{{ leaf.pct }}%</span>
            <MoneyValue :amount="leaf.amount" :currency="currency" variant="muted" class="w-20 shrink-0 text-right text-xs" />
          </div>
          <button v-if="leavesFor(row.id).length > 1 && !disabled" type="button" class="flex items-center gap-1 pt-1 text-xs text-muted-foreground hover:text-foreground" @click="distributeEvenly(row.id)">
            <Wand2Icon class="size-3" /> Distribute evenly
          </button>
        </div>
      </li>
    </ul>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-1.5">
        <UiButton type="button" variant="outline" size="sm" :disabled="disabled" @click="addBucket()"><PlusIcon class="size-4" /> Add bucket</UiButton>
        <UiPopover v-model:open="addFundOpen">
          <UiPopoverTrigger as-child>
            <UiButton type="button" variant="outline" size="sm" :disabled="disabled || !availableFunds.length"><PlusIcon class="size-4" /> Add single fund</UiButton>
          </UiPopoverTrigger>
          <UiPopoverContent align="start" class="w-60 p-1">
            <button v-for="f in availableFunds" :key="f.id" type="button" class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" @click="addSingleFund(f.id)">
              <CoinsIcon class="size-4 shrink-0 text-positive" /><span class="truncate">{{ f.name }}</span>
            </button>
            <p v-if="!availableFunds.length" class="px-2 py-1.5 text-sm text-muted-foreground">All funds routed</p>
          </UiPopoverContent>
        </UiPopover>
        <UiButton v-for="b in unallocatedBuckets" :key="b" type="button" variant="ghost" size="sm" class="h-8 text-xs text-muted-foreground" :disabled="disabled" @click="addBucket(b)">+ {{ b }}</UiButton>
      </div>
      <div class="flex items-center gap-3 text-sm">
        <span :class="overPct ? 'text-negative font-medium' : 'text-muted-foreground'">{{ pctAssigned }}% assigned</span>
        <span class="text-muted-foreground">·</span>
        <span class="flex items-center gap-1 text-muted-foreground">Variable pool <MoneyValue :amount="variablePool" :currency="currency" variant="auto" /></span>
      </div>
    </div>

    <div v-if="derived.overFunded || overPct || derived.stranded.length || derived.unrouted.length || derived.invalidFundRows.length" class="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
      <p v-if="derived.overFunded" class="flex items-center gap-1.5"><AlertTriangleIcon class="size-3.5" /> Underfunded — fixed allocations exceed the pool; percentage rows get nothing.</p>
      <p v-if="overPct" class="flex items-center gap-1.5"><AlertTriangleIcon class="size-3.5" /> Percentages exceed 100% — normalized to fit the variable pool.</p>
      <p v-if="derived.stranded.length" class="flex items-center gap-1.5"><AlertTriangleIcon class="size-3.5" /> No funds in: {{ derived.stranded.filter(Boolean).join(', ') }}.</p>
      <p v-if="derived.unrouted.length" class="flex items-center gap-1.5"><AlertTriangleIcon class="size-3.5" /> Not routed: {{ derived.unrouted.map((h) => h.name).join(', ') }}.</p>
      <p v-if="derived.invalidFundRows.length" class="flex items-center gap-1.5"><AlertTriangleIcon class="size-3.5" /> {{ derived.invalidFundRows.length }} single-fund row(s) point to a removed/paused fund.</p>
    </div>
  </div>
</template>
