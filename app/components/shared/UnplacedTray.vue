<script setup>
// Header control listing source items not yet placed on the canvas. Each row has
// a chip per account to place it on — plain buttons (no submenus), so it works
// reliably inside the full-screen dialog. Renders nothing when all placed.
import { InboxIcon } from '@lucide/vue'

defineProps({
  sources: { type: Array, default: () => [] },
  accounts: { type: Array, default: () => [] },
  currency: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  onPlace: { type: Function, default: undefined },
})
</script>

<template>
  <UiPopover v-if="sources.length">
    <UiPopoverTrigger as-child>
      <UiButton variant="outline" size="sm" :disabled="disabled">
        <InboxIcon class="size-4" /> {{ sources.length }} unplaced
      </UiButton>
    </UiPopoverTrigger>
    <UiPopoverContent align="end" class="w-80 p-0">
      <div class="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Place an item on a bank</div>
      <ul class="max-h-96 overflow-y-auto p-2">
        <li v-for="s in sources" :key="s.id" class="rounded-md px-1 py-1.5">
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ s.item || 'Untitled' }}</span>
            <MoneyValue :amount="s.amount" :currency="currency" variant="muted" class="text-xs" />
          </div>
          <div class="mt-1 flex flex-wrap gap-1">
            <button
              v-for="a in accounts"
              :key="a.id"
              type="button"
              class="rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
              @click="onPlace?.(s.id, a.id)"
            >
              {{ a.name }}
            </button>
            <span v-if="!accounts.length" class="text-xs text-muted-foreground">Add a bank account first</span>
          </div>
        </li>
      </ul>
    </UiPopoverContent>
  </UiPopover>
</template>
