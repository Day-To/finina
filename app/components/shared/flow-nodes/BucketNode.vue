<script setup>
// Bucket node (EMERALD). Receives an emerald route edge from the Pool (left); fans out to its
// fund leaves (right). Its share of the pool is PCT or fixed AMOUNT. Funds in
// this bucket (by registry grouping) get their per-fund % on the leaf nodes.
import { Handle, Position } from '@vue-flow/core'
import { LayersIcon, MoreHorizontalIcon, Wand2Icon } from '@lucide/vue'

defineProps({ id: { type: String, default: '' }, data: { type: Object, default: () => ({}) } })
</script>

<template>
  <div
    class="group relative w-60 rounded-2xl border-2 border-[var(--invest)]/45 bg-card p-3.5 shadow-lg shadow-black/20 ring-1 ring-[var(--invest)]/10"
    tabindex="0"
    :aria-label="`Bucket ${data.bucket || 'Unnamed'}, ${data.count} fund(s)`"
  >
    <Handle type="target" :position="Position.Left" />

    <div class="flex items-center justify-between gap-2">
      <span class="flex min-w-0 items-center gap-2">
        <span class="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--invest)]/15 text-[var(--invest)]"><LayersIcon class="size-4" /></span>
        <p class="min-w-0 break-words text-sm font-semibold">{{ data.bucket || 'Unnamed bucket' }}</p>
      </span>
      <UiBadge :variant="data.count ? 'secondary' : 'outline'">{{ data.count }}</UiBadge>
    </div>

    <div class="mt-2.5 flex items-center gap-2">
      <ModeToggle class="nodrag nowheel" size="sm" :model-value="data.mode" :disabled="data.disabled" @update:model-value="data.onSetMode?.($event)" />
      <div class="nodrag nowheel min-w-0 flex-1">
        <PercentInput v-if="data.mode === 'PCT'" :model-value="data.value" :disabled="data.disabled" aria-label="Percent of pool" @update:model-value="data.onSetValue?.($event)" />
        <MoneyInput v-else :model-value="data.value" :currency="data.currency" :disabled="data.disabled" @update:model-value="data.onSetValue?.($event)" />
      </div>
    </div>

    <MoneyValue :amount="data.amount" :currency="data.currency" variant="total" class="mt-2 block text-lg font-bold" />
    <p v-if="!data.count" class="mt-0.5 text-xs text-muted-foreground">No funds in this bucket yet — set a fund's bucket to “{{ data.bucket }}”.</p>

    <button
      v-if="!data.disabled && data.count > 1"
      type="button"
      class="nodrag mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      @click="data.onDistribute?.()"
    >
      <Wand2Icon class="size-3" /> Distribute evenly
    </button>

    <!-- remove -->
    <UiPopover v-if="!data.disabled">
      <UiPopoverTrigger as-child>
        <button type="button" class="nodrag absolute right-2 top-2 grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100" aria-label="Bucket options">
          <MoreHorizontalIcon class="size-4" />
        </button>
      </UiPopoverTrigger>
      <UiPopoverContent align="end" class="w-44 p-1">
        <button type="button" class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-negative hover:bg-muted" @click="data.onRemove?.()">Remove bucket</button>
      </UiPopoverContent>
    </UiPopover>

    <Handle type="source" :position="Position.Right" />
  </div>
</template>
