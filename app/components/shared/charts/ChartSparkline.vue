<script setup>
// Tiny trend line for KPI cards. Stretches to its container width.
import { computed } from 'vue'
const props = defineProps({
  values: { type: Array, default: () => [] },
  color: { type: String, default: 'var(--primary)' },
  width: { type: Number, default: 120 },
  height: { type: Number, default: 36 },
})
const pts = computed(() => props.values.filter((n) => typeof n === 'number'))
const path = computed(() => {
  const v = pts.value
  if (v.length < 2) return ''
  const min = Math.min(...v)
  const max = Math.max(...v)
  const range = max - min || 1
  const pad = 3
  const step = (props.width - pad * 2) / (v.length - 1)
  return v.map((n, i) => `${i ? 'L' : 'M'}${(pad + i * step).toFixed(1)} ${(props.height - pad - ((n - min) / range) * (props.height - pad * 2)).toFixed(1)}`).join(' ')
})
const area = computed(() => {
  if (!path.value) return ''
  const pad = 3
  return `${path.value} L${(props.width - pad).toFixed(1)} ${props.height - pad} L${pad} ${props.height - pad} Z`
})
</script>

<template>
  <svg :viewBox="`0 0 ${width} ${height}`" class="w-full" :style="{ height: height + 'px' }" preserveAspectRatio="none" aria-hidden="true">
    <path v-if="area" :d="area" :fill="color" opacity="0.12" />
    <path v-if="path" :d="path" fill="none" :stroke="color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
  </svg>
</template>
