<script setup>
// Currency-aware money entry (§9). Non-editable currency-symbol prefix + an
// editable amount stored as integer MINOR UNITS via v-model.
//
// The integer part is grouped Indian-style (x,xx,xx,xxx) live as you type. Those
// commas behave like auto-formatting, not characters:
//   • the caret skips over them (Arrow / Backspace / Delete operate on digits),
//   • copy/cut put the raw, comma-free number on the clipboard.
// No forced decimals — "10" stays "10", "10.05" stays "10.05".
import { ref, computed, watch, nextTick } from 'vue'
import { fromMinor, decimalDigits, minorFactor, currencySymbol } from '@/domain/money.js'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  currency: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  id: { type: String, default: undefined },
  class: { type: null, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const { code, locale } = useCurrency(() => props.currency)
const symbol = computed(() => currencySymbol(code.value, locale.value))
const digits = computed(() => decimalDigits(code.value))

const groupRef = ref(null)
const text = ref('')

function inputEl() {
  return groupRef.value?.$el?.querySelector?.('input') ?? null
}

const groupFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0, useGrouping: true })
function groupIndian(intStr) {
  if (intStr === '') return ''
  const n = Number(intStr)
  return Number.isFinite(n) ? groupFmt.format(n) : intStr
}

// Parse any string → { intPart (digits only), decPart, hasDot }, decimals capped.
function parse(str) {
  const s = String(str ?? '').replace(/[^\d.]/g, '')
  const dot = s.indexOf('.')
  if (dot === -1) return { intPart: s, decPart: '', hasDot: false }
  return {
    intPart: s.slice(0, dot),
    decPart: s.slice(dot + 1).replace(/\./g, '').slice(0, digits.value),
    hasDot: digits.value > 0,
  }
}
function buildFormatted(p) {
  return groupIndian(p.intPart) + (p.hasDot ? `.${p.decPart}` : '')
}
function toMinor(p) {
  const num = Number((p.intPart || '0') + (p.hasDot ? `.${p.decPart || '0'}` : ''))
  return Number.isFinite(num) ? Math.round(num * minorFactor(code.value)) : 0
}
function minorToText(minor) {
  if (!minor) return ''
  const major = fromMinor(minor, code.value)
  const fixed = digits.value === 0 ? String(Math.round(major)) : major.toFixed(digits.value).replace(/\.?0+$/, '')
  return buildFormatted(parse(fixed))
}

// Apply a raw string and place the caret after `caret` chars of the raw input,
// counting only non-comma characters (so commas are transparent to the caret).
function applyRaw(rawStr, caret) {
  const significantBefore = String(rawStr).slice(0, caret).replace(/,/g, '').length
  const parsed = parse(rawStr)
  text.value = buildFormatted(parsed)
  emit('update:modelValue', toMinor(parsed))
  nextTick(() => {
    const el = inputEl()
    if (!el) return
    const f = text.value
    // Force the DOM to the sanitized text. When stripping a non-numeric char
    // leaves `text` unchanged (e.g. "10a" → "10"), the controlled binding won't
    // re-render, so without this the rejected character would linger on screen.
    if (el.value !== f) el.value = f
    let count = 0
    let pos = f.length
    for (let i = 0; i < f.length; i++) {
      if (count === significantBefore) { pos = i; break }
      if (f[i] !== ',') count++
    }
    try { el.setSelectionRange(pos, pos) } catch { /* not focused */ }
  })
}

function onModelUpdate(newStr) {
  const el = inputEl()
  const caret = el ? (el.selectionStart ?? String(newStr).length) : String(newStr).length
  applyRaw(newStr, caret)
}

function onKeydown(e) {
  const el = inputEl()
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  if (start !== end) return
  const v = text.value
  if (e.key === 'Backspace' && start > 0 && v[start - 1] === ',') {
    e.preventDefault()
    applyRaw(v.slice(0, start - 2) + v.slice(start - 1), start - 2)
  }
  else if (e.key === 'Delete' && start < v.length && v[start] === ',') {
    e.preventDefault()
    applyRaw(v.slice(0, start + 1) + v.slice(start + 2), start + 1)
  }
  else if (e.key === 'ArrowLeft' && start > 0 && v[start - 1] === ',') {
    e.preventDefault()
    el.setSelectionRange(start - 2, start - 2)
  }
  else if (e.key === 'ArrowRight' && start < v.length && v[start] === ',') {
    e.preventDefault()
    el.setSelectionRange(start + 2, start + 2)
  }
}

function copyRaw(e) {
  const el = inputEl()
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const slice = start === end ? text.value : text.value.slice(start, end)
  e.clipboardData?.setData('text/plain', slice.replace(/,/g, ''))
  e.preventDefault()
}
function onCut(e) {
  copyRaw(e)
  const el = inputEl()
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  if (start !== end) applyRaw(text.value.slice(0, start) + text.value.slice(end), start)
}

watch(
  () => [props.modelValue, code.value],
  () => {
    if (toMinor(parse(text.value)) !== (props.modelValue ?? 0)) text.value = minorToText(props.modelValue)
  },
  { immediate: true },
)
</script>

<template>
  <UiInputGroup ref="groupRef" :class="props.class">
    <UiInputGroupAddon align="inline-start" class="py-0">
      <UiInputGroupText class="font-medium">{{ symbol }}</UiInputGroupText>
    </UiInputGroupAddon>
    <UiInputGroupInput
      :id="id"
      :model-value="text"
      :disabled="disabled"
      inputmode="decimal"
      placeholder="0"
      @update:model-value="onModelUpdate"
      @keydown="onKeydown"
      @copy="copyRaw"
      @cut="onCut"
    />
  </UiInputGroup>
</template>
