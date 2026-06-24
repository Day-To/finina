<script setup>
// Pool node (root, BLUE). The surplus pool for one investment type. From its "+"
// route money to a bucket or a single fund. Source handle on the right.
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { TrendingUpIcon } from '@lucide/vue'

const props = defineProps({ id: { type: String, default: '' }, data: { type: Object, default: () => ({}) } })
const label = computed(() => (props.data.poolKey === 'stocks' ? 'Stocks pool' : 'MF pool'))
</script>

<template>
  <div class="group relative w-64 rounded-2xl border-2 border-[var(--auto)]/55 bg-card p-3.5 shadow-lg shadow-black/20 ring-1 ring-[var(--auto)]/10">
    <div class="flex items-center gap-2">
      <span class="grid size-8 place-items-center rounded-xl bg-[var(--auto)]/15 text-[var(--auto)]">
        <TrendingUpIcon class="size-4" />
      </span>
      <p class="text-xs font-semibold uppercase tracking-widest text-[var(--auto)]">{{ label }}</p>
    </div>

    <MoneyValue :amount="data.pool" :currency="data.currency" variant="total" class="mt-2 block text-2xl font-bold" />
    <p class="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
      Routed <MoneyValue :amount="data.routed" :currency="data.currency" variant="muted" /> of <MoneyValue :amount="data.pool" :currency="data.currency" variant="muted" />
    </p>

    <p v-if="data.firstRun" class="mt-1.5 text-xs text-muted-foreground">
      Click <span class="font-medium text-foreground">+</span> to route this pool to a bucket or a single fund.
    </p>

    <Handle type="source" :position="Position.Right" />
    <InvNodePlus
      :name="label"
      :available-buckets="data.availableBuckets"
      :available-funds="data.availableFunds"
      :disabled="data.disabled"
      :always-visible="data.firstRun"
      :on-add-bucket="(b) => data.onAddBucket?.(b)"
      :on-add-fund="(fid) => data.onAddFund?.(fid)"
      :on-edit-as-list="() => data.onEditAsList?.()"
    />
  </div>
</template>
