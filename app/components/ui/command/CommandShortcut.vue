<script setup>
import { cn } from "@/lib/utils";
const props = defineProps({
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true }
  });
</script>

<template>
  <span
    data-slot="command-shortcut"
    :class="cn('text-muted-foreground group-data-selected/command-item:text-foreground ml-auto text-[0.625rem] tracking-widest', props.class)"
  >
    <slot />
  </span>
</template>
