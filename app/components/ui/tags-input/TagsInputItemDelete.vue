<script setup>
import { XIcon } from "@lucide/vue";

import { reactiveOmit } from "@vueuse/core";
import { TagsInputItemDelete, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps({
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: { type: null, required: false },
});

const delegatedProps = reactiveOmit(props, "class");

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <TagsInputItemDelete
    v-bind="forwardedProps"
    :class="cn('flex rounded bg-transparent mr-1', props.class)"
  >
    <slot>
      <XIcon class="w-4 h-4" />
    </slot>
  </TagsInputItemDelete>
</template>
