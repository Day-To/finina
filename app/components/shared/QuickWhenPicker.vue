<script setup>
import { ref, computed } from 'vue'
const props = defineProps({ modelValue: { type: Number, default: null } })
const emit = defineEmits(['update:modelValue'])
const custom = ref(false)

function atToday(h, m = 0) { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime() }
function tomorrowAt(h, m = 0) { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); return d.getTime() }
function addMonths(n) { const d = new Date(); d.setMonth(d.getMonth() + n); return d.getTime() }
function addYears(n) { const d = new Date(); d.setFullYear(d.getFullYear() + n); return d.getTime() }

const presets = computed(() => [
  { label: 'In 2 min', value: Date.now() + 2 * 60_000 },
  { label: 'In 5 min', value: Date.now() + 5 * 60_000 },
  { label: 'In 30 min', value: Date.now() + 30 * 60_000 },
  { label: 'In 1 hour', value: Date.now() + 60 * 60_000 },
  { label: 'This evening', value: atToday(18) > Date.now() ? atToday(18) : tomorrowAt(18) }, // ROUND-2: roll to tomorrow if already past 6pm (never schedule in the past)
  { label: 'Tomorrow 9 AM', value: tomorrowAt(9) },
  { label: 'Next week', value: Date.now() + 7 * 86_400_000 },
  { label: 'In 1 month', value: addMonths(1) },
  { label: 'In 1 year', value: addYears(1) },
])
function pick(v) { custom.value = false; emit('update:modelValue', v) }
const chosenLabel = computed(() => (props.modelValue ? new Date(props.modelValue).toLocaleString() : 'Pick a time'))
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap gap-1.5">
      <UiButton v-for="p in presets" :key="p.label" type="button" size="sm"
        :variant="modelValue === p.value ? 'default' : 'outline'" class="h-8" @click="pick(p.value)">
        {{ p.label }}
      </UiButton>
      <UiButton type="button" size="sm" :variant="custom ? 'default' : 'outline'" class="h-8" @click="custom = !custom">
        Custom date &amp; time
      </UiButton>
    </div>
    <DateTimePicker v-if="custom" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
    <p class="text-xs text-muted-foreground">Reminder at: <span class="font-medium text-foreground">{{ chosenLabel }}</span></p>
  </div>
</template>
