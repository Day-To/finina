<script setup>
import { ref, computed } from 'vue'
import { CalendarIcon } from '@lucide/vue'
import { parseDate } from '@internationalized/date'
const props = defineProps({ modelValue: { type: Number, default: null } })
const emit = defineEmits(['update:modelValue'])
const open = ref(false)
const base = computed(() => (props.modelValue ? new Date(props.modelValue) : new Date()))
const iso = computed(() => { const d = base.value; return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
const timeStr = computed(() => `${String(base.value.getHours()).padStart(2, '0')}:${String(base.value.getMinutes()).padStart(2, '0')}`)
const safe = (s) => { try { return parseDate(s) } catch { return undefined } }
const dateValue = computed({
  get: () => safe(iso.value),
  set: (v) => { if (v) { emitCombined(v.toString(), timeStr.value); open.value = false } },
})
function emitCombined(dIso, t) {
  const [y, m, d] = dIso.split('-').map(Number); const [hh, mm] = t.split(':').map(Number)
  emit('update:modelValue', new Date(y, m - 1, d, hh, mm, 0, 0).getTime())
}
</script>

<template>
  <div class="flex gap-2">
    <UiPopover v-model:open="open">
      <UiPopoverTrigger as-child>
        <UiButton variant="outline" type="button" class="flex-1 justify-start px-3 font-normal">
          <CalendarIcon class="size-4 shrink-0 opacity-70" /><span class="truncate">{{ iso }}</span>
        </UiButton>
      </UiPopoverTrigger>
      <UiPopoverContent class="w-auto p-0" align="start" disable-portal position-strategy="fixed">
        <UiCalendar v-model="dateValue" weekday-format="short" class="[--cell-size:--spacing(9)]" initial-focus />
      </UiPopoverContent>
    </UiPopover>
    <input type="time" :value="timeStr" class="h-9 rounded-md border bg-background px-2 text-sm"
      @input="emitCombined(iso, $event.target.value)">
  </div>
</template>
