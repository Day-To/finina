<script setup>
// End node (leaf) — an expense (RED) or a surplus split (GREEN = saving). Target handle
// only (always terminal). "×" detaches it.
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { ReceiptIcon, PiggyBankIcon, XIcon } from '@lucide/vue'
import { cn } from '@/lib/utils'

const props = defineProps({ id: { type: String, default: '' }, data: { type: Object, default: () => ({}) } })
const isSurplus = computed(() => props.data.kind === 'surplus')
</script>

<template>
  <div
    :class="cn(
      'group relative w-52 rounded-2xl border-2 bg-card p-3 shadow-lg shadow-black/20 ring-1',
      isSurplus ? 'border-[var(--positive)]/45 ring-[var(--positive)]/10' : 'border-negative/45 ring-negative/10',
    )"
    tabindex="0"
    :aria-label="`${isSurplus ? 'Surplus' : 'Expense'} ${data.item || 'Untitled'}`"
  >
    <Handle type="target" :position="Position.Left" />
    <div class="flex items-center gap-2.5">
      <span :class="cn('grid size-8 shrink-0 place-items-center rounded-xl', isSurplus ? 'bg-[var(--positive)]/15 text-[var(--positive)]' : 'bg-negative/15 text-negative')">
        <PiggyBankIcon v-if="isSurplus" class="size-4" />
        <ReceiptIcon v-else class="size-4" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold">{{ data.item || 'Untitled' }}</p>
        <MoneyValue
          :amount="data.amount"
          :currency="data.currency"
          :variant="isSurplus ? 'default' : 'negative'"
          :class="cn('text-sm font-bold', isSurplus && 'text-[var(--positive)]')"
        />
      </div>
    </div>
    <button
      v-if="!data.disabled"
      type="button"
      class="nodrag absolute -right-2 -top-2 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      :aria-label="`Detach ${data.item || 'item'}`"
      @click="data.onRemove?.(data.sourceId)"
    >
      <XIcon class="size-3" />
    </button>
  </div>
</template>
