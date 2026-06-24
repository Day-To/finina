<script setup>
// Donut with a center total + legend. Hovering an arc (or legend row) highlights
// the slice and shows a tooltip anchored to it.
import { computed, ref } from 'vue'
const props = defineProps({
  slices: { type: Array, default: () => [] }, // [{ label, value, color }]
  currency: { type: String, default: undefined },
  size: { type: Number, default: 156 },
  thickness: { type: Number, default: 20 },
  centerLabel: { type: String, default: 'Total' },
})
const total = computed(() => props.slices.reduce((s, x) => s + Math.max(0, x.value || 0), 0))
const R = computed(() => (props.size - props.thickness) / 2)
const C = computed(() => 2 * Math.PI * R.value)
const arcs = computed(() => {
  let acc = 0
  const t = total.value || 1
  const c = props.size / 2
  return props.slices.filter((s) => (s.value || 0) > 0).map((s) => {
    const frac = (s.value || 0) / t
    const mid = acc + frac / 2
    const dash = frac * C.value
    const offset = -acc * C.value
    acc += frac
    const a = 2 * Math.PI * mid
    return { ...s, dash, gap: C.value - dash, offset, pct: Math.round(frac * 100), labelX: c + R.value * Math.sin(a), labelY: c - R.value * Math.cos(a) }
  })
})
const hover = ref(-1)
const tip = computed(() => {
  const a = arcs.value[hover.value]
  return a ? { x: a.labelX, y: a.labelY, title: a.label, rows: [{ name: `${a.pct}%`, color: a.color, amount: a.value }] } : null
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-6 gap-y-4">
    <div class="relative shrink-0" :style="{ width: `${size}px`, height: `${size}px` }">
      <svg :viewBox="`0 0 ${size} ${size}`" class="size-full -rotate-90">
        <circle :cx="size / 2" :cy="size / 2" :r="R" fill="none" stroke="var(--muted)" :stroke-width="thickness" />
        <circle
          v-for="(a, i) in arcs" :key="i" :cx="size / 2" :cy="size / 2" :r="R" fill="none" :stroke="a.color"
          :stroke-width="hover === i ? thickness + 5 : thickness" :stroke-dasharray="`${a.dash} ${a.gap}`" :stroke-dashoffset="a.offset"
          class="transition-[stroke-width] duration-150" style="cursor: pointer"
          @mouseenter="hover = i" @mousemove="hover = i" @mouseleave="hover = -1"
        />
      </svg>
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span class="text-[11px] uppercase tracking-wide text-muted-foreground">{{ centerLabel }}</span>
        <MoneyValue :amount="total" :currency="currency" class="text-sm font-bold" />
      </div>
      <ChartTooltip :show="!!tip" :x="tip?.x || 0" :y="tip?.y || 0" :bound="size" :title="tip?.title || ''" :rows="tip?.rows || []" :currency="currency" />
    </div>
    <ul class="min-w-0 flex-1 space-y-2">
      <li v-for="(a, i) in arcs" :key="i" class="flex items-center gap-2 rounded text-sm transition-colors" :class="hover === i && 'bg-muted/60'" @mouseenter="hover = i" @mouseleave="hover = -1">
        <span class="size-2.5 shrink-0 rounded-full" :style="{ background: a.color }" />
        <span class="min-w-0 flex-1 truncate">{{ a.label }}</span>
        <span class="shrink-0 text-xs text-muted-foreground">{{ a.pct }}%</span>
        <MoneyValue :amount="a.value" :currency="currency" class="w-24 shrink-0 text-right text-sm" />
      </li>
      <li v-if="!arcs.length" class="text-sm text-muted-foreground">No data yet.</li>
    </ul>
  </div>
</template>
