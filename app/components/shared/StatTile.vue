<script setup>
// Dashboard stat tile (§9, S1). Value goes in the default slot (usually a
// MoneyValue); `hint` is the small caption (e.g. "+12% vs last month").
import { cn } from '@/lib/utils'

defineProps({
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
  // muted | positive | negative
  hintVariant: { type: String, default: 'muted' },
  loading: { type: Boolean, default: false },
  class: { type: null, default: '' },
})
</script>

<template>
  <UiCard :class="cn('p-4', $props.class)">
    <div class="flex flex-col gap-1">
      <span class="text-xs font-medium text-muted-foreground">{{ label }}</span>
      <UiSkeleton v-if="loading" class="h-8 w-24" />
      <div v-else class="text-2xl font-semibold tracking-tight tabular-nums">
        <slot />
      </div>
      <span
        v-if="hint && !loading"
        :class="cn('text-xs', hintVariant === 'positive' ? 'text-positive' : hintVariant === 'negative' ? 'text-negative' : 'text-muted-foreground')"
      >
        {{ hint }}
      </span>
    </div>
  </UiCard>
</template>
