<script setup>
// Full-screen investment-flow builder (Vue Flow). Pool (root, blue) → bucket
// nodes → fund leaves, plus Pool → single-fund nodes. Grow it from the pool's
// "+"; set per-fund % on the leaves. The routing array is the source of truth —
// mutated losslessly via the useInvestmentFlow mutators and emitted.
import { ref, computed, watch, markRaw, nextTick } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import { LayoutGridIcon, CheckIcon, ListIcon } from '@lucide/vue'
import { cn } from '@/lib/utils'
import { newId } from '@/domain/ids.js'
import {
  buildInvestmentTree, deriveInvestment, reconcileInvestmentSummary,
  addBucket, addSingleFund, setFundPct, setAllocMode, setAllocValue, removeAlloc, distributeEvenly,
} from '@/composables/useInvestmentFlow.js'
import PoolNode from './flow-nodes/PoolNode.vue'
import BucketNode from './flow-nodes/BucketNode.vue'
import FundNode from './flow-nodes/FundNode.vue'

const props = defineProps({
  pool: { type: Number, default: 0 },
  modelValue: { type: Array, default: () => [] },
  holdings: { type: Array, default: () => [] },
  bucketOptions: { type: Array, default: () => [] },
  currency: { type: String, default: undefined },
  poolKey: { type: String, default: 'mf' },
  disabled: { type: Boolean, default: false },
  archivedFundIds: { type: Object, default: () => new Set() },
  pausedFundIds: { type: Object, default: () => new Set() },
})
const emit = defineEmits(['update:modelValue', 'close', 'edit-as-list'])

const clone = (v) => JSON.parse(JSON.stringify(v ?? []))
const nodeTypes = { pool: markRaw(PoolNode), bucket: markRaw(BucketNode), fund: markRaw(FundNode) }

const vfId = `inv-flow-${newId()}`
const { fitView } = useVueFlow(vfId)

const work = ref(clone(props.modelValue))
const nodes = ref([])
const edges = ref([])

const derived = computed(() => deriveInvestment(props.pool, work.value, props.holdings))
const summary = computed(() => reconcileInvestmentSummary(derived.value))
const firstRun = computed(() => work.value.length === 0)

// Pickable = present, not paused, AND not live-archived (new work excludes archived).
const pickableHoldings = computed(() => (props.holdings ?? []).filter((h) => h.active !== false && !props.archivedFundIds.has(h.id)))
const soloFundIds = computed(() => new Set(work.value.filter((r) => r.kind === 'fund').map((r) => r.fundId)))
const placedBuckets = computed(() => new Set(work.value.filter((r) => r.kind === 'bucket').map((r) => (r.bucket || '').trim())))
const availableBuckets = computed(() => (props.bucketOptions ?? []).filter((b) => b && !placedBuckets.value.has(b)))
const availableFunds = computed(() => pickableHoldings.value.filter((h) => !soloFundIds.value.has(h.id)))
const eligibleFundIds = (bucket) => pickableHoldings.value.filter((h) => (h.bucket || '') === (bucket || '') && !soloFundIds.value.has(h.id)).map((h) => h.id)
const bucketOf = (allocId) => work.value.find((r) => r.id === allocId)?.bucket ?? ''

function rebuild({ reset = false } = {}) {
  const built = buildInvestmentTree({ poolKey: props.poolKey, pool: props.pool, routing: work.value, holdings: props.holdings, currency: props.currency, archivedFundIds: props.archivedFundIds, pausedFundIds: props.pausedFundIds })
  const prevPos = reset ? new Map() : new Map(nodes.value.map((n) => [n.id, n.position]))
  for (const n of built.nodes) {
    if (prevPos.has(n.id)) n.position = prevPos.get(n.id)
    n.data.disabled = props.disabled
    if (n.type === 'pool') {
      n.data.onAddBucket = onAddBucket
      n.data.onAddFund = onAddFund
      n.data.onEditAsList = () => emit('edit-as-list')
      n.data.availableBuckets = availableBuckets.value
      n.data.availableFunds = availableFunds.value
      n.data.firstRun = firstRun.value
    }
    else if (n.type === 'bucket') {
      const allocId = n.data.allocId
      n.data.onSetMode = (mode) => onSetMode(allocId, mode)
      n.data.onSetValue = (v) => onSetValue(allocId, v)
      n.data.onDistribute = () => onDistribute(allocId)
      n.data.onRemove = () => onRemove(allocId)
    }
    else if (n.type === 'fund') {
      const allocId = n.data.allocId
      n.data.onSetFundPct = (pct) => onSetFundPct(allocId, n.data.fundId, pct)
      n.data.onSetMode = (mode) => onSetMode(allocId, mode)
      n.data.onSetValue = (v) => onSetValue(allocId, v)
      n.data.onRemove = () => onRemove(allocId)
    }
  }
  nodes.value = built.nodes
  edges.value = built.edges
}

function commit() { emit('update:modelValue', clone(work.value)) }
function mutate(next) { work.value = next; rebuild(); commit() }

function onAddBucket(bucket) { if (!props.disabled) mutate(addBucket(work.value, bucket)) }
function onAddFund(fundId) { if (!props.disabled) mutate(addSingleFund(work.value, fundId)) }
function onSetMode(allocId, mode) { if (!props.disabled) mutate(setAllocMode(work.value, allocId, mode)) }
function onSetValue(allocId, value) { if (!props.disabled) mutate(setAllocValue(work.value, allocId, value)) }
function onSetFundPct(allocId, fundId, pct) { if (!props.disabled) mutate(setFundPct(work.value, allocId, fundId, pct)) }
function onDistribute(allocId) { if (!props.disabled) mutate(distributeEvenly(work.value, allocId, eligibleFundIds(bucketOf(allocId)))) }
function onRemove(allocId) { if (!props.disabled) mutate(removeAlloc(work.value, allocId)) }

function tidy() {
  rebuild({ reset: true })
  nextTick(() => fitView({ padding: 0.25 }))
}

watch(() => props.modelValue, (mv) => {
  if (JSON.stringify(mv) !== JSON.stringify(work.value)) { work.value = clone(mv); rebuild() }
}, { deep: true })
watch([() => props.pool, () => props.holdings, () => props.bucketOptions, () => props.archivedFundIds, () => props.pausedFundIds], () => rebuild(), { deep: true })

rebuild({ reset: true })
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex flex-wrap items-center gap-3 border-b px-4 py-3 pr-12">
      <h2 class="text-base font-semibold">Investment flow</h2>
      <span class="text-xs text-muted-foreground">{{ currency }}</span>
      <span
        :class="cn('rounded-full border px-2.5 py-0.5 text-xs font-medium',
          derived.balanced ? 'border-positive/40 bg-positive/10 text-positive' : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400')"
        aria-live="polite"
      >
        {{ derived.balanced ? 'Routed in full' : 'Needs attention' }}
        <span class="sr-only md:not-sr-only md:inline">· {{ summary }}</span>
      </span>
      <div class="ml-auto flex items-center gap-2">
        <InvUnplacedTray
          :unrouted="derived.unrouted"
          :invalid-fund-rows="derived.invalidFundRows"
          :disabled="disabled"
          :on-add-bucket="onAddBucket"
          :on-add-single-fund="onAddFund"
          :on-remove-alloc="onRemove"
        />
        <UiButton variant="ghost" size="sm" @click="emit('edit-as-list')"><ListIcon class="size-4" /> Edit as list</UiButton>
        <UiButton variant="outline" size="sm" @click="tidy"><LayoutGridIcon class="size-4" /> Tidy</UiButton>
        <UiButton size="sm" @click="emit('close')"><CheckIcon class="size-4" /> Done</UiButton>
      </div>
    </header>

    <div class="flow-canvas relative min-h-0 flex-1">
      <ClientOnly>
        <VueFlow
          :id="vfId"
          v-model:nodes="nodes"
          v-model:edges="edges"
          :node-types="nodeTypes"
          :nodes-connectable="false"
          :elements-selectable="true"
          :min-zoom="0.2"
          :max-zoom="1.5"
          fit-view-on-init
          class="h-full w-full"
        >
          <Background :variant="BackgroundVariant.Dots" :gap="22" pattern-color="var(--border)" />
          <Controls position="bottom-left" :show-interactive="false" />
        </VueFlow>
      </ClientOnly>
    </div>
  </div>
</template>

<style>
.flow-canvas .vue-flow__handle { background: var(--border); border-color: var(--background); width: 7px; height: 7px; }
.flow-canvas .vue-flow__edge.animated .vue-flow__edge-path { stroke-dasharray: 6 4; }
.flow-canvas .vue-flow__controls { box-shadow: none; }
.flow-canvas .vue-flow__controls-button { background: var(--card); color: var(--foreground); fill: var(--foreground); border-color: var(--border); }
.flow-canvas .vue-flow__controls-button:hover { background: var(--muted); }
.flow-canvas .vue-flow__controls-button svg { fill: var(--foreground); }
</style>
