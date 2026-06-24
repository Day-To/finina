<script setup>
// A percentage entry that supports fractional values (e.g. 33.4). A controlled
// number input echoing the coerced value back on every keystroke would drop a
// trailing '.', so we keep a local text buffer while focused and only sync from
// the prop when not editing. Emits a number (0 when blank/invalid).
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  ariaLabel: { type: String, default: 'Percent' },
})
const emit = defineEmits(['update:modelValue'])

const inputRef = ref(null)
const text = ref(String(props.modelValue ?? 0))
let editing = false
watch(() => props.modelValue, (v) => { if (!editing) text.value = String(v ?? 0) })

// Force the DOM to the sanitized text. When stripping a non-numeric char leaves
// `text` unchanged (e.g. "33a" → "33"), the controlled binding won't re-render,
// so without this the rejected character would linger on screen.
function syncDom() {
  const root = inputRef.value?.$el
  const el = root?.tagName === 'INPUT' ? root : root?.querySelector?.('input')
  if (el && el.value !== text.value) el.value = text.value
}

function onInput(v) {
  editing = true
  // Keep only digits and a single dot, so an intermediate "33." survives (a
  // type=number input would report '' here on Chromium and drop the decimal).
  let s = String(v ?? '').replace(/[^0-9.]/g, '')
  const dot = s.indexOf('.')
  if (dot >= 0) s = `${s.slice(0, dot + 1)}${s.slice(dot + 1).replace(/\./g, '')}`
  text.value = s
  const n = Number(s)
  emit('update:modelValue', s === '' || Number.isNaN(n) ? 0 : n)
  nextTick(syncDom)
}
function onBlur() {
  editing = false
  text.value = String(props.modelValue ?? 0)
}
</script>

<template>
  <UiInput
    ref="inputRef"
    type="text" inputmode="decimal"
    :model-value="text"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @update:model-value="onInput"
    @blur="onBlur"
  />
</template>
