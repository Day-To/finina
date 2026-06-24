<script setup>
// Month picker (v-model = "YYYY-MM") built from shadcn Popover + Button — no
// native month input. Year header with prev/next + a 3×4 grid of months.
import { ref, computed, watch } from 'vue'
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue'
import { formatMonthLabel, yearOf } from '@/lib/dates.js'

const props = defineProps({
  modelValue: { type: String, required: true },
  disabled: { type: Boolean, default: false },
  locale: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue'])

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const open = ref(false)
const viewYear = ref(yearOf(props.modelValue) || new Date().getFullYear())

watch(() => props.modelValue, (v) => { viewYear.value = yearOf(v) || viewYear.value })

const selMonth = computed(() => Number(String(props.modelValue).slice(5, 7)))
const selYear = computed(() => yearOf(props.modelValue))

function pick(month) {
  emit('update:modelValue', `${viewYear.value}-${String(month).padStart(2, '0')}`)
  open.value = false
}
</script>

<template>
  <UiPopover v-model:open="open">
    <UiPopoverTrigger as-child>
      <UiButton variant="outline" :disabled="disabled" class="w-full justify-between font-normal">
        {{ formatMonthLabel(modelValue, locale) }}
        <CalendarDaysIcon class="size-4 text-muted-foreground" />
      </UiButton>
    </UiPopoverTrigger>
    <UiPopoverContent class="w-64 p-3">
      <div class="mb-2 flex items-center justify-between">
        <UiButton type="button" variant="ghost" size="icon" class="size-7" aria-label="Previous year" @click="viewYear--">
          <ChevronLeftIcon class="size-4" />
        </UiButton>
        <span class="text-sm font-semibold">{{ viewYear }}</span>
        <UiButton type="button" variant="ghost" size="icon" class="size-7" aria-label="Next year" @click="viewYear++">
          <ChevronRightIcon class="size-4" />
        </UiButton>
      </div>
      <div class="grid grid-cols-3 gap-1">
        <UiButton
          v-for="(m, i) in MONTHS"
          :key="m"
          type="button"
          size="sm"
          :variant="(i + 1 === selMonth && viewYear === selYear) ? 'default' : 'ghost'"
          @click="pick(i + 1)"
        >
          {{ m }}
        </UiButton>
      </div>
    </UiPopoverContent>
  </UiPopover>
</template>
