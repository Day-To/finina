<script setup>
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
const props = defineProps({
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true }
  });
</script>

<template>
  <Input
    data-slot="input-group-control"
    :class="cn(
      'rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent flex-1',
      props.class,
    )"
  />
</template>
