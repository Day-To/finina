<script setup>
import { reactiveOmit } from "@vueuse/core";
import { ComboboxSeparator } from "reka-ui";
import { cn } from "@/lib/utils";
const props = defineProps({
    asChild: { type: Boolean, required: false },
    as: { type: null, required: false },
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true }
  });
const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <ComboboxSeparator
    data-slot="combobox-separator"
    v-bind="delegatedProps"
    :class="cn('bg-border/50 -mx-1 my-1 h-px', props.class)"
  >
    <slot />
  </ComboboxSeparator>
</template>
