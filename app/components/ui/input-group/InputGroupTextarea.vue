<script setup>
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
const props = defineProps({
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true }
  });
</script>

<template>
  <Textarea
    data-slot="input-group-control"
    :class="cn(
      'rounded-none border-0 bg-transparent py-2 shadow-none ring-0 focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent flex-1 resize-none',
      props.class,
    )"
  />
</template>
