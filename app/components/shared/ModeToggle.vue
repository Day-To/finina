<script setup>
// Segmented %/Amt toggle. Filled-pill style: the selected option gets a green
// (positive) tint inside a muted track; the other is muted text. Used for the
// PCT|AMOUNT mode across surplus, routing, and the flow-editor nodes.
const props = defineProps({
  modelValue: { type: String, default: 'PCT' }, // 'PCT' | 'AMOUNT'
  disabled: { type: Boolean, default: false },
  size: { type: String, default: 'md' }, // 'sm' | 'md'
})
const emit = defineEmits(['update:modelValue'])
const options = [{ value: 'PCT', label: '%' }, { value: 'AMOUNT', label: 'Amt' }]
</script>

<template>
  <div class="inline-flex shrink-0 items-center gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Amount mode">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      :disabled="disabled"
      :aria-pressed="modelValue === o.value"
      :aria-label="o.value === 'PCT' ? 'Percent' : 'Fixed amount'"
      :class="[
        'rounded-md font-medium transition-colors disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
        modelValue === o.value
          ? 'bg-[var(--positive)]/15 text-[var(--positive)] shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      ]"
      @click="emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>
