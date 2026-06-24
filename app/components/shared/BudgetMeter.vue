<script setup>
// Daily-budget meter (§9, S9). Currency-aware; turns negative-colored when over
// budget. Custom bar (not UiProgress) so the fill color can reflect over/under.
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps({
  budget: { type: Number, default: 0 },
  spent: { type: Number, default: 0 },
  currency: { type: String, default: undefined },
  // Pacing (optional): expected spend = perDay * elapsedDays.
  perDay: { type: Number, default: 0 },
  elapsedDays: { type: Number, default: 0 },
  class: { type: null, default: '' },
})

const remaining = computed(() => props.budget - props.spent)
const over = computed(() => props.spent > props.budget)
const pct = computed(() => {
  if (props.budget <= 0) return props.spent > 0 ? 100 : 0
  return Math.min(100, Math.max(0, (props.spent / props.budget) * 100))
})

const expected = computed(() => Math.round(props.perDay * props.elapsedDays))
const showPace = computed(() => props.elapsedDays > 0 && props.budget > 0)
const expectedPct = computed(() => Math.min(100, Math.max(0, (expected.value / props.budget) * 100)))
const onPace = computed(() => props.spent <= expected.value)
</script>

<template>
  <div :class="cn('space-y-2', $props.class)">
    <div class="flex items-end justify-between gap-2">
      <div>
        <p class="text-xs font-medium text-muted-foreground">Spent this month</p>
        <MoneyValue :amount="spent" :currency="currency" variant="total" class="text-xl" />
      </div>
      <div class="text-right">
        <p class="text-xs font-medium text-muted-foreground">{{ over ? 'Over by' : 'Remaining' }}</p>
        <MoneyValue :amount="Math.abs(remaining)" :currency="currency" :variant="over ? 'negative' : 'positive'" class="text-xl" />
      </div>
    </div>

    <div
      class="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      :aria-valuenow="Math.round(pct)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div
        class="h-full rounded-full transition-all"
        :class="over ? 'bg-negative' : 'bg-positive'"
        :style="{ width: `${pct}%` }"
      />
      <!-- "expected by today" pace marker -->
      <div
        v-if="showPace"
        class="absolute inset-y-0 w-0.5 bg-foreground/60"
        :style="{ left: `${expectedPct}%` }"
        :title="`Expected by today`"
      />
    </div>

    <div class="flex items-center justify-between gap-2 text-xs">
      <span class="text-muted-foreground">
        Budget <MoneyValue :amount="budget" :currency="currency" variant="muted" />
      </span>
      <span v-if="showPace" :class="onPace ? 'text-positive' : 'text-negative'">
        {{ onPace ? 'On pace' : 'Over pace' }} · expected <MoneyValue :amount="expected" :currency="currency" :variant="onPace ? 'positive' : 'negative'" />
      </span>
    </div>
  </div>
</template>
