<script setup>
// Thin wrapper over the shadcn tags-input (§9). v-model is an array of strings.
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Add tag…' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const tags = computed({
  get: () => props.modelValue ?? [],
  set: (v) => emit('update:modelValue', v),
})
</script>

<template>
  <UiTagsInput v-model="tags" :disabled="disabled" class="w-full">
    <UiTagsInputItem v-for="tag in tags" :key="tag" :value="tag">
      <UiTagsInputItemText />
      <UiTagsInputItemDelete />
    </UiTagsInputItem>
    <UiTagsInputInput :placeholder="placeholder" />
  </UiTagsInput>
</template>
