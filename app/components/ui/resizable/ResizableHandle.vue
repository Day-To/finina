<script setup>
import { reactiveOmit } from "@vueuse/core";
import { SplitterResizeHandle, useForwardPropsEmits } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps({
  id: { type: String, required: false },
  hitAreaMargins: { type: Object, required: false },
  tabindex: { type: Number, required: false },
  disabled: { type: Boolean, required: false },
  nonce: { type: String, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: { type: null, required: false },
  withHandle: { type: Boolean, required: false },
});
const emits = defineEmits(["dragging"]);

const delegatedProps = reactiveOmit(props, "class", "withHandle");
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <SplitterResizeHandle
    data-slot="resizable-handle"
    v-bind="forwarded"
    :class="
      cn(
        'relative flex w-px items-center justify-center bg-border ring-offset-background after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90',
        props.class,
      )
    "
  >
    <template v-if="props.withHandle">
      <div class="bg-border h-6 w-1 rounded-lg z-10 flex shrink-0">
        <slot />
      </div>
    </template>
  </SplitterResizeHandle>
</template>
