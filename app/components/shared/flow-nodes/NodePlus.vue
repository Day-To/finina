<script setup>
// The "+" affordance on a node's right edge. Click → a flat Popover list of
// banks to add (income only) and unplaced expenses to attach. Plain buttons
// (fire on click AND keyboard) — no submenus, so it works reliably inside a Vue
// Flow node within the full-screen dialog.
import { ref } from 'vue'
import { PlusIcon, LandmarkIcon, ReceiptIcon } from '@lucide/vue'

const props = defineProps({
  name: { type: String, default: '' },
  canAddBank: { type: Boolean, default: false },
  canAddExpense: { type: Boolean, default: false },
  availableAccounts: { type: Array, default: () => [] },
  unplacedSources: { type: Array, default: () => [] },
  currency: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  alwaysVisible: { type: Boolean, default: false },
  onAddBank: { type: Function, default: undefined },
  onAddExpense: { type: Function, default: undefined },
})

const open = ref(false)
function addBank(id) { props.onAddBank?.(id); open.value = false }
function addExpense(id) { props.onAddExpense?.(id); open.value = false }
</script>

<template>
  <UiPopover v-model:open="open">
    <UiPopoverTrigger as-child>
      <button
        type="button"
        :disabled="disabled"
        class="nodrag nowheel absolute -right-3 top-1/2 z-10 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition hover:border-primary/60 hover:bg-muted hover:text-foreground focus-visible:opacity-100 disabled:opacity-40 [@media(hover:none)]:opacity-100"
        :class="alwaysVisible || open ? 'opacity-100' : 'opacity-60 group-hover:opacity-100 group-focus-within:opacity-100'"
        :aria-label="`Add to ${name}`"
      >
        <PlusIcon class="size-3.5" />
      </button>
    </UiPopoverTrigger>
    <UiPopoverContent side="right" align="start" class="w-60 p-0">
      <div class="max-h-80 overflow-y-auto p-1.5">
        <template v-if="canAddBank">
          <p class="px-2 py-1 text-xs font-medium text-muted-foreground">Add bank account</p>
          <button
            v-for="a in availableAccounts"
            :key="a.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            @click="addBank(a.id)"
          >
            <LandmarkIcon class="size-4 shrink-0 text-auto" />
            <span class="truncate">{{ a.name }}</span>
          </button>
          <p v-if="!availableAccounts.length" class="px-2 py-1.5 text-sm text-muted-foreground">All accounts added</p>
          <div class="my-1 border-t" />
        </template>

        <p class="px-2 py-1 text-xs font-medium text-muted-foreground">Add expense item</p>
        <template v-if="canAddExpense">
          <button
            v-for="s in unplacedSources"
            :key="s.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            @click="addExpense(s.id)"
          >
            <ReceiptIcon class="size-4 shrink-0 text-negative" />
            <span class="min-w-0 flex-1 truncate">{{ s.item || 'Untitled' }}</span>
            <MoneyValue :amount="s.amount" :currency="currency" variant="muted" class="text-xs" />
          </button>
          <p v-if="!unplacedSources.length" class="px-2 py-1.5 text-sm text-muted-foreground">All items placed</p>
        </template>
        <p v-else class="px-2 py-1.5 text-sm text-muted-foreground">Pick where income lands first.</p>
      </div>
    </UiPopoverContent>
  </UiPopover>
</template>
