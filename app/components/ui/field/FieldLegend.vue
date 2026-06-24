<script setup>
import { cn } from "@/lib/utils";
const props = defineProps({
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true },
    variant: { type: String, required: false, default: "legend" }
  });
</script>

<template>
  <legend
    data-slot="field-legend"
    :data-variant="variant"
    :class="cn('mb-2 font-medium data-[variant=label]:text-xs/relaxed data-[variant=legend]:text-sm', props.class)"
  >
    <slot />
  </legend>
</template>
