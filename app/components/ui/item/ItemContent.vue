<script setup>
import { cn } from "@/lib/utils";
const props = defineProps({
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true }
  });
</script>

<template>
  <div
    data-slot="item-content"
    :class="cn('gap-1 group-data-[size=xs]/item:gap-0.5 flex flex-1 flex-col [&+[data-slot=item-content]]:flex-none', props.class)"
  >
    <slot />
  </div>
</template>
