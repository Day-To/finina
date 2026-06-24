<script setup>
// Purposeful empty state (§12). Pass an icon via the #icon slot and CTAs via the
// default slot.
import { cn } from '@/lib/utils'

defineProps({
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  class: { type: null, default: '' },
})
const slots = defineSlots()
</script>

<template>
  <div
    :class="cn('flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center', $props.class)"
  >
    <div v-if="slots.icon" class="rounded-full bg-muted p-3 text-muted-foreground">
      <slot name="icon" />
    </div>
    <div class="space-y-1">
      <h3 class="text-sm font-semibold">{{ title }}</h3>
      <p v-if="description" class="mx-auto max-w-sm text-sm text-muted-foreground">
        {{ description }}
      </p>
    </div>
    <div v-if="slots.default" class="mt-1 flex flex-wrap items-center justify-center gap-2">
      <slot />
    </div>
  </div>
</template>
