<script setup>
// Header control listing funds not yet routed (+ invalid single-fund rows).
// Plain buttons (no submenus) so it works inside the full-screen dialog.
import { InboxIcon } from '@lucide/vue'

defineProps({
  unrouted: { type: Array, default: () => [] }, // [{ id, name, bucket }]
  invalidFundRows: { type: Array, default: () => [] }, // [{ id, fundId, amount }]
  disabled: { type: Boolean, default: false },
  onAddBucket: { type: Function, default: undefined },
  onAddSingleFund: { type: Function, default: undefined },
  onRemoveAlloc: { type: Function, default: undefined },
})
</script>

<template>
  <UiPopover v-if="unrouted.length || invalidFundRows.length">
    <UiPopoverTrigger as-child>
      <UiButton variant="outline" size="sm" :disabled="disabled">
        <InboxIcon class="size-4" /> {{ unrouted.length + invalidFundRows.length }} to route
      </UiButton>
    </UiPopoverTrigger>
    <UiPopoverContent align="end" class="w-80 p-0">
      <div class="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Route these funds</div>
      <ul class="max-h-96 overflow-y-auto p-2">
        <li v-for="f in unrouted" :key="f.id" class="rounded-md px-1 py-1.5">
          <p class="truncate text-sm font-medium">{{ f.name }}</p>
          <div class="mt-1 flex flex-wrap gap-1">
            <button type="button" class="rounded-md border px-2 py-0.5 text-xs hover:bg-muted" @click="onAddSingleFund?.(f.id)">→ single fund</button>
            <button v-if="f.bucket" type="button" class="rounded-md border px-2 py-0.5 text-xs hover:bg-muted" @click="onAddBucket?.(f.bucket)">→ add “{{ f.bucket }}” bucket</button>
          </div>
        </li>
        <li v-for="r in invalidFundRows" :key="r.id" class="rounded-md px-1 py-1.5">
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-sm text-negative">Invalid fund routing</span>
            <button type="button" class="rounded-md border px-2 py-0.5 text-xs hover:bg-muted" @click="onRemoveAlloc?.(r.id)">Remove</button>
          </div>
        </li>
      </ul>
    </UiPopoverContent>
  </UiPopover>
</template>
