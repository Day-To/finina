<script setup>
import { cn } from "@/lib/utils";

const props = defineProps({
  class: { type: null, required: false },
});
</script>

<template>
  <span
    data-slot="menubar-shortcut"
    :class="
      cn(
        'text-muted-foreground group-focus/menubar-item:text-accent-foreground text-[0.625rem] tracking-widest ml-auto',
        props.class,
      )
    "
  >
    <slot />
  </span>
</template>
