<script setup>
// Prev / pick / next month control (§11). v-model is a "YYYY-MM" key. The middle
// uses the shadcn-based MonthPicker (Popover), not a native month input.
import { computed } from 'vue'
import { ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue'
import { shiftMonthId } from '@/lib/dates.js'

const props = defineProps({
  modelValue: { type: String, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const picked = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

function shift(delta) {
  emit('update:modelValue', shiftMonthId(props.modelValue, delta))
}
</script>

<template>
  <div class="flex items-center gap-1">
    <UiButton type="button" variant="outline" size="icon" class="size-8 shrink-0" :disabled="disabled" aria-label="Previous month" @click="shift(-1)">
      <ChevronLeftIcon class="size-4" />
    </UiButton>
    <div class="w-40"><MonthPicker v-model="picked" :disabled="disabled" /></div>
    <UiButton type="button" variant="outline" size="icon" class="size-8 shrink-0" :disabled="disabled" aria-label="Next month" @click="shift(1)">
      <ChevronRightIcon class="size-4" />
    </UiButton>
  </div>
</template>
