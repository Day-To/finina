<script setup>
// Bank-name picker: choose a preset bank or type a custom one (creatable).
// Renders an INLINE dropdown (not a portaled Popover) so it works inside a modal
// dialog's focus trap — a portaled popover input can't receive keyboard focus there.
import { ref, computed, nextTick } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { ChevronsUpDownIcon, CheckIcon, PlusIcon } from '@lucide/vue'
import { cn } from '@/lib/utils'

const BANKS = [
  'Punjab National Bank',
  'State Bank of India',
  'Axis Bank',
  'IDFC Bank',
  'Kotak Mahindra Bank',
]

const props = defineProps({
  modelValue: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Select or type a bank' },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const query = ref('')
const rootRef = ref(null)
const searchRef = ref(null)

onClickOutside(rootRef, () => { open.value = false })

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? BANKS.filter((b) => b.toLowerCase().includes(q)) : BANKS
})
const canAddCustom = computed(() => {
  const q = query.value.trim()
  return q.length > 0 && !BANKS.some((b) => b.toLowerCase() === q.toLowerCase())
})

function focusSearch() {
  const el = searchRef.value?.$el
  const input = el?.tagName === 'INPUT' ? el : el?.querySelector?.('input')
  input?.focus?.()
}
function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) nextTick(focusSearch)
}
function select(value) {
  emit('update:modelValue', value)
  open.value = false
  query.value = ''
}
function commit() {
  const q = query.value.trim()
  if (filtered.value.length === 1) select(filtered.value[0])
  else if (q) select(q)
}
</script>

<template>
  <div ref="rootRef" class="relative">
    <UiButton
      type="button"
      variant="outline"
      role="combobox"
      :aria-expanded="open"
      :disabled="disabled"
      class="w-full justify-between font-normal"
      @click="toggle"
    >
      <span :class="cn('truncate', !modelValue && 'text-muted-foreground')">{{ modelValue || placeholder }}</span>
      <ChevronsUpDownIcon class="size-4 shrink-0 opacity-50" />
    </UiButton>

    <div
      v-if="open"
      class="absolute left-0 top-full z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md"
    >
      <div class="p-2">
        <UiInput
          ref="searchRef"
          v-model="query"
          placeholder="Search or type a bank…"
          @keydown.enter.prevent="commit"
          @keydown.esc.stop.prevent="open = false"
        />
      </div>
      <ul class="max-h-56 overflow-y-auto p-1">
        <li v-for="b in filtered" :key="b">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            @click="select(b)"
          >
            <span class="flex-1 truncate">{{ b }}</span>
            <CheckIcon v-if="b === modelValue" class="size-4 text-primary" />
          </button>
        </li>
        <li v-if="canAddCustom">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            @click="select(query.trim())"
          >
            <PlusIcon class="size-4 shrink-0" />
            <span class="truncate">Use “{{ query.trim() }}”</span>
          </button>
        </li>
        <li v-if="!filtered.length && !canAddCustom" class="px-2 py-4 text-center text-xs text-muted-foreground">
          No banks found
        </li>
      </ul>
    </div>
  </div>
</template>
