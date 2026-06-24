<script setup>
import { useForwardPropsEmits } from "reka-ui";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Command from "./Command.vue";
const props = defineProps({
    open: { type: Boolean, required: false },
    defaultOpen: { type: Boolean, required: false },
    modal: { type: Boolean, required: false },
    unmountOnHide: { type: Boolean, required: false },
    title: { type: String, required: false, default: "Command Palette" },
    description: { type: String, required: false, default: "Search for a command to run..." },
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true },
    showCloseButton: { type: Boolean, required: false, default: false }
  });
const emits = defineEmits(["update:open"]);
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <Dialog v-slot="slotProps" v-bind="forwarded">
    <DialogContent
      :class="cn('rounded-xl! top-1/3 translate-y-0 overflow-hidden p-0', props.class)"
      :show-close-button="showCloseButton"
    >
      <DialogHeader class="sr-only">
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>
      <Command>
        <slot v-bind="slotProps" />
      </Command>
    </DialogContent>
  </Dialog>
</template>
