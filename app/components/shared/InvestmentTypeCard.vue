<script setup>
// One investment type (Mutual Funds OR Stocks) as a self-contained, colour-coded
// card — the de-crammed, segregated replacement for the old shared Investments
// block. Presentational + editing-host: the page still owns draft state; this
// card emits changes. Accent (emerald: var(--invest) for MF, var(--invest-2) for stocks)
// tints the left border, icon chip and routed meter so the two are instantly
// distinguishable in light and dark. Preserves every data point.
import { computed } from 'vue'
import { TrendingUpIcon, LineChartIcon } from '@lucide/vue'

const props = defineProps({
  poolKey: { type: String, required: true }, // 'mf' | 'stocks'
  kind: { type: String, required: true }, // 'mutualFund' | 'stock'
  label: { type: String, required: true },
  accent: { type: String, required: true }, // a CSS color, e.g. 'var(--positive)'
  pool: { type: Number, default: 0 },
  pct: { type: Number, default: 0 }, // % of income
  breakdown: { type: Object, default: null },
  currency: { type: String, default: undefined },
  holdings: { type: Array, default: () => [] },
  bucketOptions: { type: Array, default: () => [] },
  archivedFundIds: { type: Object, default: () => new Set() },
  pausedFundIds: { type: Object, default: () => new Set() },
  route: { type: String, default: 'mutual-funds' },
  modelValue: { type: Array, default: () => [] },
  listOpen: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'reset', 'update:listOpen'])

const noun = computed(() => (props.kind === 'stock' ? 'stock' : 'fund'))
const routedPct = computed(() => (props.pool > 0 ? Math.min(100, Math.max(0, ((props.breakdown?.total ?? 0) / props.pool) * 100)) : 0))
const balanced = computed(() => {
  const b = props.breakdown
  if (!b) return false
  return b.stranded?.length === 0 && b.unrouted?.length === 0 && b.invalidFundRows?.length === 0
    && !b.overFunded && b.total === b.resolvedTotal && b.total === b.pool
})
const hasWarning = computed(() => {
  const b = props.breakdown
  return !!b && (b.resolvedTotal !== b.total || b.invalidFundRows?.length || b.stranded?.length || b.unrouted?.length || b.overFunded)
})
const chipBg = computed(() => `color-mix(in srgb, ${props.accent} 14%, transparent)`)
</script>

<template>
  <UiCard class="border-l-2 py-5" :style="{ borderLeftColor: accent }">
    <UiCardHeader>
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-md" :style="{ background: chipBg, color: accent }">
            <component :is="poolKey === 'stocks' ? LineChartIcon : TrendingUpIcon" class="size-4.5" />
          </span>
          <div>
            <UiCardTitle class="text-base">{{ label }}</UiCardTitle>
            <span
              class="mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium"
              :class="balanced ? 'border-positive/40 bg-positive/10 text-positive' : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'"
            >{{ balanced ? 'Routed in full' : 'Needs attention' }}</span>
          </div>
        </div>
        <div class="text-right">
          <p class="text-xs uppercase tracking-wide text-muted-foreground">Pool</p>
          <MoneyValue :amount="pool" :currency="currency" variant="total" class="text-xl tabular-nums" />
          <p class="text-xs text-muted-foreground">{{ pct }}% of income</p>
        </div>
      </div>
    </UiCardHeader>

    <UiCardContent class="space-y-4">
      <!-- routed meter -->
      <div class="space-y-1.5">
        <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div class="h-full rounded-full transition-all" :style="{ width: `${routedPct}%`, backgroundColor: accent }" />
        </div>
        <p class="flex items-center justify-end gap-1 text-xs">
          <span class="text-muted-foreground">Routed</span>
          <MoneyValue :amount="breakdown?.total ?? 0" :currency="currency" variant="total" />
          <span class="text-muted-foreground">of</span>
          <MoneyValue :amount="pool" :currency="currency" variant="muted" />
        </p>
      </div>

      <!-- routing snapshot / node editor -->
      <InvestmentFlowMapper
        :model-value="modelValue"
        :pool="pool"
        :holdings="holdings"
        :bucket-options="bucketOptions"
        :currency="currency"
        :pool-key="poolKey"
        :archived-fund-ids="archivedFundIds"
        :paused-fund-ids="pausedFundIds"
        @update:model-value="emit('update:modelValue', $event)"
        @edit-as-list="emit('update:listOpen', true)"
      />

      <!-- resolved per-fund amounts -->
      <div v-if="breakdown?.holdings?.length" class="rounded-md border bg-muted/30 p-2">
        <p class="mb-1 px-1 text-xs font-medium text-muted-foreground">This month each {{ noun }} gets</p>
        <InvestmentDistribution :holdings="breakdown.holdings" :currency="currency" :archived-fund-ids="archivedFundIds" :paused-fund-ids="pausedFundIds" />
      </div>

      <p v-if="hasWarning" class="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
        Some of the pool isn’t reaching a {{ noun }} yet — open the flow to fix it.
      </p>

      <UiCollapsible :open="listOpen" @update:open="emit('update:listOpen', $event)">
        <UiCollapsibleContent class="pt-1">
          <BucketRoutingControl
            :model-value="modelValue"
            :currency="currency"
            :sample-pool="pool"
            :holdings="holdings"
            :bucket-options="bucketOptions"
            :archived-fund-ids="archivedFundIds"
            :paused-fund-ids="pausedFundIds"
            @update:model-value="emit('update:modelValue', $event)"
          />
        </UiCollapsibleContent>
      </UiCollapsible>
    </UiCardContent>

    <UiCardFooter class="justify-end gap-1">
      <UiButton variant="link" size="sm" as-child><NuxtLink :to="`/investments/${route}`">Edit reusable plan →</NuxtLink></UiButton>
      <UiButton variant="ghost" size="sm" class="text-muted-foreground" @click="emit('reset')">Reset to plan</UiButton>
    </UiCardFooter>
  </UiCard>
</template>
