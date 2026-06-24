<script setup>
// Fund leaf node (GREEN). Two shapes:
//  - parentKind 'bucket': share of a bucket — edit its per-fund % here.
//  - parentKind 'pool'  : routed directly from the pool — edit its PCT/AMOUNT.
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { CoinsIcon, XIcon, TriangleAlertIcon } from '@lucide/vue'
import { cn } from '@/lib/utils'

const props = defineProps({ id: { type: String, default: '' }, data: { type: Object, default: () => ({}) } })
const isDirect = computed(() => props.data.parentKind === 'pool')
// Four states: missing (purged) > archived (retired) > paused > active.
const archived = computed(() => !props.data.invalid && !!props.data.archived)
const paused = computed(() => !props.data.invalid && !props.data.archived && !!props.data.paused)
const editable = computed(() => !props.data.invalid && !archived.value) // archived = frozen past record
</script>

<template>
  <div
    :class="cn('group relative w-52 rounded-2xl border-2 bg-card p-3 shadow-lg shadow-black/20 ring-1',
      data.invalid ? 'border-negative/55 ring-negative/10' : 'border-positive/45 ring-positive/10',
      paused && 'opacity-70')"
    tabindex="0"
    :aria-label="`Fund ${data.name}${archived ? ', archived' : paused ? ', paused' : ''}`"
  >
    <Handle type="target" :position="Position.Left" />

    <div class="flex items-center gap-2.5">
      <span :class="cn('grid size-8 shrink-0 place-items-center rounded-xl', data.invalid ? 'bg-negative/15 text-negative' : 'bg-positive/15 text-positive')">
        <TriangleAlertIcon v-if="data.invalid" class="size-4" /><CoinsIcon v-else class="size-4" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <p class="truncate text-sm font-semibold">{{ data.name }}</p>
          <UiBadge v-if="archived" variant="outline" class="shrink-0 text-muted-foreground">Archived</UiBadge>
          <span v-else-if="paused" class="shrink-0 text-[11px] text-muted-foreground">paused</span>
        </div>
        <p v-if="data.invalid" class="text-xs text-negative">fund removed</p>
        <MoneyValue v-else :amount="data.amount" :currency="data.currency" variant="total" class="text-sm font-bold" />
      </div>
    </div>

    <!-- single fund: route value -->
    <div v-if="isDirect && editable" class="nodrag nowheel mt-2 flex items-center gap-2">
      <ModeToggle size="sm" :model-value="data.mode" :disabled="data.disabled" @update:model-value="data.onSetMode?.($event)" />
      <div class="min-w-0 flex-1">
        <PercentInput v-if="data.mode === 'PCT'" :model-value="data.value" :disabled="data.disabled" aria-label="Percent of pool" @update:model-value="data.onSetValue?.($event)" />
        <MoneyInput v-else :model-value="data.value" :currency="data.currency" :disabled="data.disabled" @update:model-value="data.onSetValue?.($event)" />
      </div>
    </div>

    <!-- bucket leaf: per-fund % -->
    <div v-else-if="editable" class="nodrag nowheel mt-2 flex items-center gap-2">
      <div class="w-20"><PercentInput :model-value="data.rawPct ?? 0" :disabled="data.disabled" aria-label="Share of bucket" @update:model-value="data.onSetFundPct?.($event)" /></div>
      <span class="text-xs text-muted-foreground">{{ data.rawPct == null ? `auto · ${data.pct}%` : `→ ${data.pct}%` }}</span>
    </div>

    <button
      v-if="isDirect && !data.disabled && !archived"
      type="button"
      class="nodrag absolute -right-2 -top-2 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      aria-label="Remove single-fund routing"
      @click="data.onRemove?.()"
    >
      <XIcon class="size-3" />
    </button>
  </div>
</template>
