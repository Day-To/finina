<script setup>
// Bank node (BLUE) — a transfer destination. Receives a blue transfer edge
// from Income (left handle); fans out to red expense leaves (right handle + "+").
// Its transfer total is derived (sum of attached expenses), never typed.
import { Handle, Position } from '@vue-flow/core'
import { LandmarkIcon, MoreHorizontalIcon } from '@lucide/vue'

defineProps({ id: { type: String, default: '' }, data: { type: Object, default: () => ({}) } })
</script>

<template>
  <div
    class="group relative w-56 rounded-2xl border-2 border-auto/55 bg-card p-3.5 shadow-lg shadow-black/20 ring-1 ring-auto/10"
    tabindex="0"
    :aria-label="`Bank ${data.name}, ${data.count} item(s), transfer ${data.total}${data.archived ? ', archived' : ''}`"
  >
    <Handle type="target" :position="Position.Left" />

    <div class="flex items-center justify-between gap-2">
      <span class="flex min-w-0 items-center gap-2">
        <span class="grid size-8 shrink-0 place-items-center rounded-xl bg-auto/15 text-auto">
          <LandmarkIcon class="size-4" />
        </span>
        <p class="truncate text-sm font-semibold">{{ data.name }}</p>
      </span>
      <UiBadge v-if="data.archived" variant="outline" class="shrink-0 text-muted-foreground">Archived</UiBadge>
      <UiBadge v-else :variant="data.count ? 'secondary' : 'outline'">{{ data.count }}</UiBadge>
    </div>
    <MoneyValue :amount="data.total" :currency="data.currency" variant="total" class="mt-2 block text-xl font-bold" />
    <p v-if="!data.count" class="mt-0.5 text-xs text-muted-foreground">No items yet</p>

    <!-- remove (childless only) — hidden for archived (read-only past record) -->
    <UiPopover v-if="!data.disabled && !data.archived">
      <UiPopoverTrigger as-child>
        <button type="button" class="nodrag absolute right-2 top-2 grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100" aria-label="Bank options">
          <MoreHorizontalIcon class="size-4" />
        </button>
      </UiPopoverTrigger>
      <UiPopoverContent align="end" class="w-48 p-1">
        <button v-if="data.count === 0" type="button" class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-negative hover:bg-muted" @click="data.onRemoveBank?.(data.accountId)">
          Remove bank
        </button>
        <p v-else class="px-2 py-1.5 text-xs text-muted-foreground">Detach its items first to remove this bank.</p>
      </UiPopoverContent>
    </UiPopover>

    <Handle type="source" :position="Position.Right" />
    <NodePlus
      v-if="!data.archived"
      :name="data.name"
      :can-add-bank="false"
      :can-add-expense="true"
      :unplaced-sources="data.unplacedSources"
      :currency="data.currency"
      :disabled="data.disabled"
      :on-add-expense="(sid) => data.onAddExpense?.(sid)"
    />
  </div>
</template>
