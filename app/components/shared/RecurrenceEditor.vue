<script setup>
import { computed } from 'vue'
import { PlusIcon, XIcon } from '@lucide/vue'
import { describeRecurrence } from '@/domain/calc/recurrence.js'
const props = defineProps({ modelValue: { type: Object, required: true } })
const emit = defineEmits(['update:modelValue'])
const r = computed(() => props.modelValue)
const set = (patch) => emit('update:modelValue', { ...r.value, ...patch })

const FREQS = [['NONE', 'Does not repeat'], ['HOURLY', 'Hourly'], ['DAILY', 'Daily'], ['WEEKLY', 'Weekly'], ['MONTHLY', 'Monthly'], ['YEARLY', 'Yearly']]
const WD = [['SU', 'S'], ['MO', 'M'], ['TU', 'T'], ['WE', 'W'], ['TH', 'T'], ['FR', 'F'], ['SA', 'S']]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const unit = computed(() => ({ HOURLY: 'hour', DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[r.value.freq] || ''))
const showWeekday = computed(() => r.value.freq === 'WEEKLY')
const showMonth = computed(() => r.value.freq === 'YEARLY' || r.value.freq === 'MONTHLY')
const showTimes = computed(() => r.value.freq === 'DAILY' || r.value.freq === 'WEEKLY')
const showMonthday = computed(() => r.value.freq === 'MONTHLY')
const endsMode = computed(() => (r.value.count != null ? 'count' : (r.value.endsAt != null ? 'date' : 'never')))

function addTime() { set({ times: [...r.value.times, '09:00'] }) }
function setTime(i, v) { const t = [...r.value.times]; t[i] = v; set({ times: t }) }
function rmTime(i) { set({ times: r.value.times.filter((_, j) => j !== i) }) }
function toggleMonth(m) { const s = new Set(r.value.byMonth); s.has(m) ? s.delete(m) : s.add(m); set({ byMonth: [...s].sort((a, b) => a - b) }) }
function setEnds(mode) {
  if (mode === 'never') set({ endsAt: null, count: null })
  else if (mode === 'count') set({ endsAt: null, count: r.value.count ?? 5 })
  else set({ count: null, endsAt: r.value.endsAt ?? Date.now() + 30 * 86_400_000 })
}
// ROUND-2 FIX B3: clear freq-specific sub-fields on frequency change so a hidden
// control's stale value (e.g. DAILY times[] left over) can't silently alter behavior
// after switching to another frequency. interval/endsAt/count apply across freqs → kept.
function onFreq(freq) {
  set({ freq, byWeekday: [], byMonth: [], byMonthday: [], times: [] })
}
</script>

<template>
  <div class="space-y-3">
    <UiSelect :model-value="r.freq" @update:model-value="onFreq($event)">
      <UiSelectTrigger><UiSelectValue /></UiSelectTrigger>
      <UiSelectContent><UiSelectItem v-for="[v, l] in FREQS" :key="v" :value="v">{{ l }}</UiSelectItem></UiSelectContent>
    </UiSelect>

    <template v-if="r.freq !== 'NONE'">
      <div class="flex items-center gap-2 text-sm">
        <span>Every</span>
        <UiNumberField :model-value="r.interval" :min="1" class="w-24" @update:model-value="set({ interval: $event || 1 })">
          <UiNumberFieldContent><UiNumberFieldDecrement /><UiNumberFieldInput /><UiNumberFieldIncrement /></UiNumberFieldContent>
        </UiNumberField>
        <span>{{ unit }}{{ r.interval > 1 ? 's' : '' }}</span>
      </div>

      <UiToggleGroup v-if="showWeekday" type="multiple" :model-value="r.byWeekday"
        @update:model-value="set({ byWeekday: $event || [] })">
        <UiToggleGroupItem v-for="[v, l] in WD" :key="v" :value="v" class="size-9">{{ l }}</UiToggleGroupItem>
      </UiToggleGroup>

      <div v-if="showMonth" class="flex flex-wrap gap-1">
        <UiButton v-for="(m, i) in MONTHS" :key="m" type="button" size="sm" class="h-8 w-12"
          :variant="r.byMonth.includes(i + 1) ? 'default' : 'outline'" @click="toggleMonth(i + 1)">{{ m }}</UiButton>
      </div>

      <UiSelect v-if="showMonthday" :model-value="String(r.byMonthday[0] ?? '')" @update:model-value="set({ byMonthday: $event ? [Number($event)] : [] })">
        <UiSelectTrigger><UiSelectValue placeholder="Day of month (default: same as start)" /></UiSelectTrigger>
        <UiSelectContent><UiSelectItem v-for="d in 31" :key="d" :value="String(d)">Day {{ d }}</UiSelectItem></UiSelectContent>
      </UiSelect>

      <div v-if="showTimes" class="space-y-1.5">
        <div v-for="(t, i) in r.times" :key="i" class="flex items-center gap-2">
          <input type="time" :value="t" class="h-9 rounded-md border bg-background px-2 text-sm" @input="setTime(i, $event.target.value)">
          <UiButton type="button" variant="ghost" size="icon" class="size-8" @click="rmTime(i)"><XIcon class="size-4" /></UiButton>
        </div>
        <UiButton type="button" variant="outline" size="sm" class="h-8" @click="addTime"><PlusIcon class="size-4" /> Add a time</UiButton>
        <p class="text-[11px] text-muted-foreground">No times = once per day at the start time. Add a second for “twice a day”.</p>
      </div>

      <div class="flex items-center gap-2 text-sm">
        <span>Ends</span>
        <UiSelect :model-value="endsMode" @update:model-value="setEnds($event)">
          <UiSelectTrigger class="w-40"><UiSelectValue /></UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem value="never">Never</UiSelectItem>
            <UiSelectItem value="date">On date</UiSelectItem>
            <UiSelectItem value="count">After N times</UiSelectItem>
          </UiSelectContent>
        </UiSelect>
        <DateTimePicker v-if="endsMode === 'date'" :model-value="r.endsAt" @update:model-value="set({ endsAt: $event })" />
        <UiNumberField v-if="endsMode === 'count'" :model-value="r.count" :min="1" class="w-24" @update:model-value="set({ count: $event || 1 })">
          <UiNumberFieldContent><UiNumberFieldDecrement /><UiNumberFieldInput /><UiNumberFieldIncrement /></UiNumberFieldContent>
        </UiNumberField>
      </div>
    </template>

    <p class="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{{ describeRecurrence(r) }}</p>
  </div>
</template>
