<script setup>
// Read-only per-holding breakdown for a bucket (or the month block). Shows each
// fund/stock with its weight and resolved amount.
defineProps({
  holdings: { type: Array, default: () => [] },
  currency: { type: String, default: undefined },
  empty: { type: Boolean, default: false },
  archivedFundIds: { type: Object, default: () => new Set() },
  pausedFundIds: { type: Object, default: () => new Set() },
})
</script>

<template>
  <div>
    <p v-if="empty" class="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">
      No active holdings in this bucket — its amount is unallocated.
    </p>
    <ul v-else-if="holdings.length" class="space-y-0.5">
      <li v-for="h in holdings" :key="`${h.allocId}-${h.id}`" class="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
        <span class="min-w-0 flex-1 truncate">{{ h.name }}</span>
        <UiBadge v-if="archivedFundIds.has(h.id)" variant="outline" class="shrink-0 text-muted-foreground">Archived</UiBadge>
        <span v-else-if="pausedFundIds.has(h.id)" class="shrink-0 text-[11px] text-muted-foreground">paused</span>
        <span v-if="h.pct != null" class="shrink-0 text-[11px] text-muted-foreground">{{ h.pct }}%</span>
        <MoneyValue :amount="h.amount" :currency="currency" variant="muted" class="shrink-0 text-xs" />
      </li>
    </ul>
  </div>
</template>
