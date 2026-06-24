<script setup>
import { Primitive } from "reka-ui";
import { cn } from "@/lib/utils";
const props = defineProps({
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true },
    orientation: { type: null, required: false },
    asChild: { type: Boolean, required: false },
    as: { type: null, required: false, default: "div" }
  });
</script>

<template>
  <Primitive
    role="group"
    :data-orientation="props.orientation"
    :as="as"
    :as-child="asChild"
    :class="cn('bg-muted gap-2 rounded-md border px-2.5 text-xs/relaxed font-medium [&_svg:not([class*=size-])]:size-4 flex items-center [&_svg]:pointer-events-none', props.class)"
  >
    <slot />
  </Primitive>
</template>
