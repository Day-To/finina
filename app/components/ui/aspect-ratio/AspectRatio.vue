<script setup>
import { AspectRatio } from "reka-ui";

const props = defineProps({
  ratio: { type: Number, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
});
</script>

<template>
  <AspectRatio v-slot="slotProps" data-slot="aspect-ratio" v-bind="props">
    <slot v-bind="slotProps" />
  </AspectRatio>
</template>
