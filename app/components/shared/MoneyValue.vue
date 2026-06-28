<script setup>
// Formats integer minor units via the active currency (Intl). Never format money
// by hand — always use this (§12). Variants distinguish input/derived/total and
// positive/negative; `auto` colors by sign.
import { computed } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps({
  amount: { type: Number, default: 0 },
  currency: { type: String, default: undefined },
  // default | positive(saving) | negative(spend) | invest(emerald) | total | muted | auto(transfer, colors by sign)
  variant: { type: String, default: 'default' },
  class: { type: null, default: '' },
})

const { format } = useCurrency(() => props.currency)
const formatted = computed(() => format(props.amount ?? 0))

const colorClass = computed(() => {
  const amt = props.amount ?? 0
  if (props.variant === 'auto') {
    return amt < 0 ? 'text-negative' : amt > 0 ? 'text-positive' : 'text-foreground'
  }
  return {
    positive: 'text-positive',
    negative: 'text-negative',
    invest: 'text-invest',
    muted: 'text-muted-foreground',
    total: 'font-semibold text-foreground',
    default: 'text-foreground',
  }[props.variant] ?? 'text-foreground'
})
</script>

<template>
  <span :class="cn('tabular-nums', colorClass, props.class)">{{ formatted }}</span>
</template>
