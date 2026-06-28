<script setup>
// The "+" affordance on the Pool node. Click → a flat Popover listing registry
// buckets to add and single funds to route directly. Plain buttons (fire on
// click AND keyboard), no submenus / no text input — works inside a Vue Flow
// node in the full-screen dialog. New bucket NAMES are created via "Edit as list".
import { ref } from 'vue'
import { PlusIcon, LayersIcon, CoinsIcon } from '@lucide/vue'

const props = defineProps({
  name: { type: String, default: '' },
  availableBuckets: { type: Array, default: () => [] },
  availableFunds: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  alwaysVisible: { type: Boolean, default: false },
  onAddBucket: { type: Function, default: undefined },
  onAddFund: { type: Function, default: undefined },
  onEditAsList: { type: Function, default: undefined },
})

const open = ref(false)
function addBucket(b) { props.onAddBucket?.(b); open.value = false }
function addFund(id) { props.onAddFund?.(id); open.value = false }
function editAsList() { props.onEditAsList?.(); open.value = false }
</script>

<template>
  <UiPopover v-model:open="open">
    <UiPopoverTrigger as-child>
      <button
        type="button"
        :disabled="disabled"
        class="nodrag nowheel absolute -right-3 top-1/2 z-10 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition hover:border-primary/60 hover:bg-muted hover:text-foreground focus-visible:opacity-100 disabled:opacity-40 [@media(hover:none)]:opacity-100"
        :class="alwaysVisible || open ? 'opacity-100' : 'opacity-60 group-hover:opacity-100 group-focus-within:opacity-100'"
        :aria-label="`Route ${name}`"
      >
        <PlusIcon class="size-3.5" />
      </button>
    </UiPopoverTrigger>
    <UiPopoverContent side="right" align="start" class="w-64 p-0">
      <div class="max-h-80 overflow-y-auto p-1.5">
        <p class="px-2 py-1 text-xs font-medium text-muted-foreground">Route to a bucket</p>
        <button
          v-for="b in availableBuckets"
          :key="b"
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
          @click="addBucket(b)"
        >
          <LayersIcon class="size-4 shrink-0 text-[var(--invest)]" />
          <span class="truncate">{{ b }}</span>
        </button>
        <button type="button" class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted" @click="editAsList">
          <PlusIcon class="size-3.5 shrink-0" /> New bucket name… (Edit as list)
        </button>

        <div class="my-1 border-t" />
        <p class="px-2 py-1 text-xs font-medium text-muted-foreground">Route to a single fund</p>
        <button
          v-for="f in availableFunds"
          :key="f.id"
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
          @click="addFund(f.id)"
        >
          <CoinsIcon class="size-4 shrink-0 text-invest" />
          <span class="truncate">{{ f.name }}</span>
        </button>
        <p v-if="!availableFunds.length" class="px-2 py-1.5 text-sm text-muted-foreground">All funds routed</p>
      </div>
    </UiPopoverContent>
  </UiPopover>
</template>
