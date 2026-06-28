<script setup>
// Compact, static snapshot of an investment pool's routing. Clicking opens the
// full-screen node editor. No Vue Flow mounted here. Mirrors FlowMapperPreview.
import { computed } from 'vue'
import { Maximize2Icon } from '@lucide/vue'
import { cn } from '@/lib/utils'
import { deriveInvestment, reconcileInvestmentSummary } from '@/composables/useInvestmentFlow.js'

const props = defineProps({
  pool: { type: Number, default: 0 },
  modelValue: { type: Array, default: () => [] },
  holdings: { type: Array, default: () => [] },
  currency: { type: String, default: undefined },
  poolKey: { type: String, default: 'mf' },
  label: { type: String, default: 'Investment flow' },
  archivedFundIds: { type: Object, default: () => new Set() },
  pausedFundIds: { type: Object, default: () => new Set() },
})
const emit = defineEmits(['open'])

const d = computed(() => deriveInvestment(props.pool, props.modelValue, props.holdings))
const bucketRows = computed(() => d.value.rows.filter((r) => r.kind === 'bucket'))
const fundRows = computed(() => d.value.rows.filter((r) => r.kind === 'fund'))
const chips = computed(() => d.value.rows.slice(0, 3))
const archivedCount = computed(() => d.value.holdings.filter((h) => props.archivedFundIds.has(h.id)).length)
const pausedCount = computed(() => d.value.holdings.filter((h) => props.pausedFundIds.has(h.id)).length)
const chipLabel = (r) => (r.kind === 'fund' ? (d.value.holdings.find((h) => h.allocId === r.id)?.name ?? 'fund') : (r.bucket || 'bucket'))
</script>

<template>
  <button
    type="button"
    class="group w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
    aria-haspopup="dialog"
    @click="emit('open')"
  >
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm font-medium">{{ label }}</p>
      <span class="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
        <Maximize2Icon class="size-3.5" /> Open editor
      </span>
    </div>

    <div class="my-3 flex items-center gap-2">
      <span class="size-3 shrink-0 rounded-full bg-[var(--invest)]" />
      <span class="h-px min-w-4 flex-1 bg-border" />
      <span class="flex shrink-0 gap-1">
        <span v-for="r in bucketRows.slice(0, 4)" :key="r.id" class="size-2.5 rounded-full bg-[var(--invest)]/50" />
        <span v-if="!bucketRows.length && !fundRows.length" class="text-[10px] text-muted-foreground">not routed</span>
      </span>
      <span class="h-px min-w-4 flex-1 bg-border" />
      <span class="flex shrink-0 gap-1">
        <span v-for="h in d.holdings.slice(0, 5)" :key="`${h.allocId}-${h.id}`" class="size-2 rounded-full bg-invest/60" />
      </span>
    </div>

    <p class="text-sm text-muted-foreground">
      {{ bucketRows.length }} bucket{{ bucketRows.length === 1 ? '' : 's' }} · {{ fundRows.length }} direct fund{{ fundRows.length === 1 ? '' : 's' }} → {{ d.holdings.length }} fund{{ d.holdings.length === 1 ? '' : 's' }}
      <span v-if="archivedCount" class="text-muted-foreground"> · {{ archivedCount }} archived</span>
      <span v-if="pausedCount" class="text-muted-foreground"> · {{ pausedCount }} paused</span>
    </p>

    <div v-if="chips.length" class="mt-2 flex flex-wrap items-center gap-1.5">
      <span v-for="r in chips" :key="r.id" class="flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs">
        <span class="max-w-24 truncate">{{ chipLabel(r) }}</span>
        <MoneyValue :amount="r.amount" :currency="currency" variant="total" />
      </span>
    </div>

    <span
      :class="cn('mt-3 inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium',
        d.balanced ? 'border-positive/40 bg-positive/10 text-positive' : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400')"
    >
      {{ d.balanced ? 'Routed in full' : `Needs attention · ${reconcileInvestmentSummary(d)}` }}
    </span>
  </button>
</template>
