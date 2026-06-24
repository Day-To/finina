<script setup>
import { reactiveOmit } from "@vueuse/core";
import { ComboboxEmpty } from "reka-ui";
import { cn } from "@/lib/utils";
const props = defineProps({
    asChild: { type: Boolean, required: false },
    as: { type: null, required: false },
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true }
  });
const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <ComboboxEmpty
    data-slot="combobox-empty"
    v-bind="delegatedProps"
    :class="cn('text-muted-foreground hidden w-full justify-center py-2 text-center text-xs/relaxed group-data-empty/combobox-content:flex', props.class)"
  >
    <slot />
  </ComboboxEmpty>
</template>
