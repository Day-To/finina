<script setup>
import { Primitive } from "reka-ui";
import { cn } from "@/lib/utils";
import { itemVariants } from ".";
const props = defineProps({
    asChild: { type: Boolean, required: false },
    as: { type: null, required: false, default: "div" },
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true },
    variant: { type: null, required: false, default: "default" },
    size: { type: null, required: false, default: "default" }
  });
</script>

<template>
  <Primitive
    data-slot="item"
    :data-variant="variant"
    :data-size="size"
    :as="as"
    :as-child="asChild"
    :class="cn(itemVariants({ variant, size }), props.class)"
  >
    <slot />
  </Primitive>
</template>
