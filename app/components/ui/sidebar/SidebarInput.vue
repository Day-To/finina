<script setup>
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
const props = defineProps({
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true }
  });
</script>

<template>
  <Input
    data-slot="sidebar-input"
    data-sidebar="input"
    :class="cn('bg-muted/20 dark:bg-muted/30 border-input h-8 w-full', props.class)"
  >
    <slot />
  </Input>
</template>
