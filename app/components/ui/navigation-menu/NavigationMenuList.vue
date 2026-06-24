<script setup>
import { reactiveOmit } from "@vueuse/core";
import { NavigationMenuList, useForwardProps } from "reka-ui";
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
  <NavigationMenuList
    data-slot="navigation-menu-list"
    v-bind="forwardedProps"
    :class="
      cn(
        'gap-0 group flex flex-1 list-none items-center justify-center',
        props.class,
      )
    "
  >
    <slot />
  </NavigationMenuList>
</template>
