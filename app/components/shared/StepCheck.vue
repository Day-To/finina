<script setup>
// Animated done indicator for the Start-month ritual: a hollow ring that fills
// with the scene accent + a popping checkmark and a radial spark burst the moment
// it's completed — so every tick feels rewarding.
import { CheckIcon } from '@lucide/vue'
defineProps({
  done: { type: Boolean, default: false },
  small: { type: Boolean, default: false },
  accent: { type: String, default: 'var(--positive)' },
})
const SPARKS = [0, 60, 120, 180, 240, 300]
</script>

<template>
  <span class="relative grid shrink-0 place-items-center">
    <span
      class="grid place-items-center rounded-full border-2 text-white transition-all duration-300"
      :class="[small ? 'size-6' : 'size-8', done ? 'scale-100' : 'scale-95 border-muted-foreground/30 !text-transparent']"
      :style="done ? { background: accent, borderColor: accent } : {}"
    >
      <CheckIcon v-if="done" class="animate-in zoom-in-50 duration-300" :class="small ? 'size-3.5' : 'size-4'" />
    </span>
    <template v-if="done">
      <span
        v-for="a in SPARKS" :key="a"
        class="step-spark pointer-events-none absolute size-1.5 rounded-full"
        :style="{ background: accent, '--a': a + 'deg' }"
      />
    </template>
  </span>
</template>
