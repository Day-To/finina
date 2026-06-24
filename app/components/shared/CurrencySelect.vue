<script setup>
// Currency picker over the curated registry (§9). Symbols are derived from Intl.
// Used in Settings + onboarding. Each option is a single clean text line so the
// trigger's SelectValue renders it correctly (no jammed multi-span text).
import { computed } from 'vue'
import { CURRENCIES } from '@/domain/currencies.js'
import { currencySymbol } from '@/domain/money.js'

const props = defineProps({
  modelValue: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  id: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue'])

const value = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const options = computed(() =>
  CURRENCIES.map((c) => ({ ...c, label: `${c.code} — ${c.name} (${currencySymbol(c.code)})` })),
)
</script>

<template>
  <UiSelect v-model="value" :disabled="disabled">
    <UiSelectTrigger :id="id" class="w-full">
      <UiSelectValue placeholder="Select currency" />
    </UiSelectTrigger>
    <UiSelectContent class="max-h-72">
      <UiSelectItem v-for="c in options" :key="c.code" :value="c.code">
        {{ c.label }}
      </UiSelectItem>
    </UiSelectContent>
  </UiSelect>
</template>
