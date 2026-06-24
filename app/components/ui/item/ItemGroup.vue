<script setup>
import { cn } from "@/lib/utils";
const props = defineProps({
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true }
  });
</script>

<template>
  <div
    role="list"
    data-slot="item-group"
    :class="cn('gap-4 has-data-[size=sm]:gap-2.5 has-data-[size=xs]:gap-2 group/item-group flex w-full flex-col', props.class)"
  >
    <slot />
  </div>
</template>
