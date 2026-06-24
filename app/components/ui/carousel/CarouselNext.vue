<script setup>
import { ChevronRightIcon } from "@lucide/vue";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCarousel } from "./useCarousel";
const props = defineProps({
    variant: { type: null, required: false, default: "outline" },
    size: { type: null, required: false, default: "icon-sm" },
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true }
  });
const { orientation, canScrollNext, scrollNext } = useCarousel();
</script>

<template>
  <Button
    data-slot="carousel-next"
    :disabled="!canScrollNext"
    :class="cn(
      'rounded-full absolute touch-manipulation',
      orientation === 'horizontal'
        ? 'top-1/2 -right-12 -translate-y-1/2'
        : '-bottom-12 left-1/2 -translate-x-1/2 rotate-90',
      props.class,
    )"
    :variant="variant"
    :size="size"
    @click="scrollNext"
  >
    <slot>
      <ChevronRightIcon class="cn-rtl-flip" />
      <span class="sr-only">Next slide</span>
    </slot>
  </Button>
</template>
