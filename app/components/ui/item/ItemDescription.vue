<script setup>
import { cn } from "@/lib/utils";
const props = defineProps({
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true }
  });
</script>

<template>
  <p
    data-slot="item-description"
    :class="cn(
      'text-muted-foreground text-left text-xs/relaxed line-clamp-2 font-normal [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
      props.class,
    )"
  >
    <slot />
  </p>
</template>
