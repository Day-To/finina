<script setup>
// Full-screen tree builder (Vue Flow). Income (root) → green bank transfers →
// red expense leaves. Grow it from the income node's "+" (add bank / add
// expense); no dragging required. The flow model is the source of truth — we
// mutate a working copy losslessly via assignInFlow/setIncomeInFlow and emit.
import { ref, computed, watch, markRaw, nextTick } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import { LayoutGridIcon, CheckIcon } from '@lucide/vue'
import { cn } from '@/lib/utils'
import { newId } from '@/domain/ids.js'
import {
  buildTree, deriveFlow, reconcileSummary, assignInFlow, setIncomeInFlow, flattenAssignment, visibleBankIds, NONE,
} from '@/composables/useFlowGraph.js'
import IncomeNode from './flow-nodes/IncomeNode.vue'
import BankNode from './flow-nodes/BankNode.vue'
import ExpenseNode from './flow-nodes/ExpenseNode.vue'
import OrphanNode from './flow-nodes/OrphanNode.vue'

const props = defineProps({
  sources: { type: Array, default: () => [] },
  accounts: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({ incomeAccountId: null, allocations: [] }) },
  currency: { type: String, default: undefined },
  income: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'close'])

const clone = (v) => JSON.parse(JSON.stringify(v ?? { incomeAccountId: null, allocations: [] }))

const nodeTypes = {
  income: markRaw(IncomeNode),
  bank: markRaw(BankNode),
  expense: markRaw(ExpenseNode),
  orphan: markRaw(OrphanNode),
}

const vfId = `flow-${newId()}`
const { fitView } = useVueFlow(vfId)

const work = ref(clone(props.modelValue))
const placed = ref(new Set()) // editor-local banks added but not yet given an expense
const nodes = ref([])
const edges = ref([])

const derived = computed(() => deriveFlow(props.sources, props.accounts, work.value))
const summary = computed(() => reconcileSummary(derived.value))
const unplacedSources = computed(() => derived.value.unassigned)
const availableAccounts = computed(() => {
  const visible = new Set(visibleBankIds(props.sources, props.accounts, work.value, [...placed.value]))
  const incomeId = work.value.incomeAccountId
  return props.accounts.filter((a) => a.id !== incomeId && !a.archived && !visible.has(a.id))
})
const firstRun = computed(() =>
  !work.value.incomeAccountId
  && visibleBankIds(props.sources, props.accounts, work.value, [...placed.value]).length === 0
  && derived.value.unassigned.length === (props.sources?.length ?? 0),
)

function rebuild({ reset = false } = {}) {
  const built = buildTree({
    sources: props.sources, accounts: props.accounts, flow: work.value, income: props.income, currency: props.currency, placed: [...placed.value],
  })
  const prevPos = reset ? new Map() : new Map(nodes.value.map((n) => [n.id, n.position]))
  const avail = availableAccounts.value
  const unplaced = unplacedSources.value
  for (const n of built.nodes) {
    if (prevPos.has(n.id)) n.position = prevPos.get(n.id)
    n.data.disabled = props.disabled
    if (n.type === 'income') {
      n.data.onSetIncome = onSetIncome
      n.data.onAddBank = onAddBank
      n.data.onAddExpense = (sid) => onAddExpense(sid, work.value.incomeAccountId)
      n.data.availableAccounts = avail
      n.data.unplacedSources = unplaced
      n.data.firstRun = firstRun.value
    }
    else if (n.type === 'bank') {
      const accId = n.data.accountId
      n.data.onAddExpense = (sid) => onAddExpense(sid, accId)
      n.data.onRemoveBank = onRemoveBank
      n.data.unplacedSources = unplaced
    }
    else if (n.type === 'expense') {
      n.data.onRemove = onRemoveExpense
    }
    else if (n.type === 'orphan') {
      const accId = n.data.accId
      n.data.onReassign = (target) => onReassignOrphan(accId, target)
      n.data.accounts = props.accounts.filter((a) => !a.archived) // don't reassign into an archived account
    }
  }
  nodes.value = built.nodes
  edges.value = built.edges
}

function commit() {
  emit('update:modelValue', clone(work.value))
}
function onSetIncome(value) {
  if (props.disabled) return
  work.value = setIncomeInFlow(work.value, value)
  rebuild()
  commit()
}
function onAddBank(accountId) {
  if (props.disabled) return
  const next = new Set(placed.value)
  next.add(accountId)
  placed.value = next
  rebuild() // no data change yet → no commit
}
function onAddExpense(sourceId, accountId) {
  if (props.disabled || !accountId) return
  work.value = assignInFlow(work.value, sourceId, accountId)
  rebuild()
  commit()
}
function onRemoveExpense(sourceId) {
  if (props.disabled) return
  work.value = assignInFlow(work.value, sourceId, NONE)
  rebuild()
  commit()
}
function onRemoveBank(accountId) {
  if (props.disabled) return
  const next = new Set(placed.value)
  next.delete(accountId)
  placed.value = next
  rebuild()
}
function onReassignOrphan(orphanAccId, target) {
  if (props.disabled || !target) return
  const assign = flattenAssignment(work.value)
  let next = work.value
  for (const s of props.sources ?? []) {
    if (assign.get(s.id) === orphanAccId) next = assignInFlow(next, s.id, target)
  }
  work.value = next
  rebuild()
  commit()
}

function tidy() {
  rebuild({ reset: true })
  nextTick(() => fitView({ padding: 0.25 }))
}

watch(() => props.modelValue, (mv) => {
  if (JSON.stringify(mv) !== JSON.stringify(work.value)) {
    work.value = clone(mv)
    rebuild()
  }
}, { deep: true })
watch([() => props.sources, () => props.accounts, () => props.income], () => rebuild(), { deep: true })

rebuild({ reset: true })
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex flex-wrap items-center gap-3 border-b px-4 py-3 pr-12">
      <h2 class="text-base font-semibold">Money flow</h2>
      <span class="text-xs text-muted-foreground">{{ currency }}</span>
      <span
        :class="cn('rounded-full border px-2.5 py-0.5 text-xs font-medium',
          derived.balanced ? 'border-positive/40 bg-positive/10 text-positive' : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400')"
        aria-live="polite"
      >
        {{ derived.balanced ? 'Reconciled' : 'Needs attention' }}
        <span class="sr-only md:not-sr-only md:inline">· {{ summary }}</span>
      </span>
      <div class="ml-auto flex items-center gap-2">
        <UnplacedTray :sources="unplacedSources" :accounts="accounts" :currency="currency" :disabled="disabled" :on-place="onAddExpense" />
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
/* Theme Vue Flow internals with our CSS vars. Namespaced to .flow-canvas. */
.flow-canvas .vue-flow__handle { background: var(--border); border-color: var(--background); width: 7px; height: 7px; }
.flow-canvas .vue-flow__edge.animated .vue-flow__edge-path { stroke-dasharray: 6 4; }
.flow-canvas .vue-flow__controls { box-shadow: none; }
.flow-canvas .vue-flow__controls-button { background: var(--card); color: var(--foreground); fill: var(--foreground); border-color: var(--border); }
.flow-canvas .vue-flow__controls-button:hover { background: var(--muted); }
.flow-canvas .vue-flow__controls-button svg { fill: var(--foreground); }
</style>
