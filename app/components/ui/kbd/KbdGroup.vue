<script setup>
import { cn } from "@/lib/utils";

const props = defineProps({
  class: { type: null, required: false },
});
</script>

<template>
  <kbd
    data-slot="kbd-group"
    :class="cn('gap-1 inline-flex items-center', props.class)"
  >
    <slot />
  </kbd>
</template>
