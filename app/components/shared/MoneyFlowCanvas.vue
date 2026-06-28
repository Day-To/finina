<script setup>
// Full-screen, read-only Vue Flow canvas of the whole month's money map. Pure
// projection via buildMoneyGraph — pan/zoom only, no editing. Mirrors the
// FlowGraphEditor chrome (header pill + Tidy + Done) so it feels native.
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
import { buildMoneyGraph } from '@/composables/useMoneyGraph.js'
import MoneyFlowNode from './flow-nodes/MoneyFlowNode.vue'

const props = defineProps({
  month: { type: Object, default: null },
  accounts: { type: Array, default: () => [] },
  accountsById: { type: Object, default: null },
  registry: { type: Array, default: () => [] },
  currency: { type: String, default: undefined },
  archivedFundIds: { type: Object, default: () => new Set() },
  pausedFundIds: { type: Object, default: () => new Set() },
})
const emit = defineEmits(['close'])

const nodeTypes = { money: markRaw(MoneyFlowNode) }
const vfId = `money-${newId()}`
const { fitView } = useVueFlow(vfId)

const graph = computed(() => buildMoneyGraph({
  month: props.month, accounts: props.accounts, accountsById: props.accountsById,
  registry: props.registry, currency: props.currency,
  archivedFundIds: props.archivedFundIds, pausedFundIds: props.pausedFundIds,
}))

const nodes = ref(graph.value.nodes)
const edges = ref(graph.value.edges)

watch(graph, (g) => { nodes.value = g.nodes; edges.value = g.edges; nextTick(() => fitView({ padding: 0.15 })) })

function tidy() {
  const g = graph.value
  nodes.value = g.nodes.map((n) => ({ ...n }))
  edges.value = g.edges
  nextTick(() => fitView({ padding: 0.15 }))
}

const LEGEND = [
  { c: 'var(--auto)', label: 'Income' },
  { c: '#a855f7', label: 'Accounts' },
  { c: 'var(--negative)', label: 'Expenses' },
  { c: '#f59e0b', label: 'Savings' },
  { c: 'var(--positive)', label: 'Mutual funds' },
  { c: '#14b8a6', label: 'Stocks' },
]
const counts = computed(() => graph.value.counts)
const reconcile = computed(() => graph.value.reconcile)
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 pr-12">
      <h2 class="text-base font-semibold">Money map</h2>
      <span
        :class="cn('rounded-full border px-2.5 py-0.5 text-xs font-medium',
          reconcile.balanced ? 'border-positive/40 bg-positive/10 text-positive' : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400')"
        aria-live="polite"
      >{{ reconcile.balanced ? 'Reconciled' : 'Needs attention' }}</span>
      <span class="hidden text-xs text-muted-foreground sm:inline">{{ counts.accounts }} accounts · {{ counts.items }} items · {{ counts.funds }} funds</span>

      <div class="hidden items-center gap-3 lg:flex">
        <span v-for="(l, i) in LEGEND" :key="i" class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span class="size-2.5 rounded-full" :style="{ background: l.c }" />{{ l.label }}
        </span>
      </div>

      <div class="ml-auto flex items-center gap-2">
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
          :elements-selectable="false"
          :min-zoom="0.1"
          :max-zoom="1.8"
          fit-view-on-init
          class="h-full w-full"
        >
          <Background :variant="BackgroundVariant.Dots" :gap="24" pattern-color="var(--border)" />
          <Controls position="bottom-left" :show-interactive="false" />
        </VueFlow>
      </ClientOnly>
    </div>
  </div>
</template>

<style>
/* Theme Vue Flow internals with our CSS vars. Namespaced to .flow-canvas. */
.flow-canvas .vue-flow__handle { background: var(--border); border-color: var(--background); width: 6px; height: 6px; }
.flow-canvas .vue-flow__edge.animated .vue-flow__edge-path { stroke-dasharray: 6 4; }
.flow-canvas .vue-flow__edge-text { fill: var(--muted-foreground); font-size: 10px; font-weight: 600; }
.flow-canvas .vue-flow__edge-textbg { fill: var(--card); }
.flow-canvas .vue-flow__controls { box-shadow: none; }
.flow-canvas .vue-flow__controls-button { background: var(--card); color: var(--foreground); fill: var(--foreground); border-color: var(--border); }
.flow-canvas .vue-flow__controls-button:hover { background: var(--muted); }
.flow-canvas .vue-flow__controls-button svg { fill: var(--foreground); }
</style>
