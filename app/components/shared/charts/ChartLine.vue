<script setup>
// Line / area chart — one or more series. Responsive via useElementSize. Set
// `pct` to render values as 0–100%. Hovering a month shows a vertical guide,
// highlights the points, and opens a tooltip with every series' value.
import { computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
const props = defineProps({
  data: { type: Array, default: () => [] }, // [{ label, values: number[] }]
  series: { type: Array, default: () => [] }, // [{ name, color, area? }]
  height: { type: Number, default: 220 },
  currency: { type: String, default: undefined },
  formatAxis: { type: Function, default: null }, // overrides default formatting
  pct: { type: Boolean, default: false },
})
const wrap = ref(null)
const { width } = useElementSize(wrap)
const PADL = 46
const PADB = 24
const PADT = 12
const PADR = 12
const W = computed(() => Math.max(280, Math.round(width.value) || 640))
const innerW = computed(() => W.value - PADL - PADR)
const innerH = computed(() => props.height - PADT - PADB)
// Domain spans [min(0, data), max] — so a deficit month's negative value renders
// below a zero line instead of dropping off the bottom of the chart.
const domain = computed(() => {
  const vals = []
  for (const d of props.data) for (const v of d.values || []) vals.push(v || 0)
  const hiData = vals.length ? Math.max(...vals) : 0
  const loData = vals.length ? Math.min(...vals) : 0
  const hi = props.pct ? Math.max(1, hiData) : Math.max(0, hiData)
  const lo = Math.min(0, loData)
  return { lo, hi: hi > lo ? hi : lo + 1 }
})
const ticks = computed(() => Array.from({ length: 5 }, (_, i) => domain.value.lo + ((domain.value.hi - domain.value.lo) * i) / 4))
const stepX = computed(() => (props.data.length > 1 ? innerW.value / (props.data.length - 1) : 0))
const x = (i) => (props.data.length > 1 ? PADL + i * stepX.value : PADL + innerW.value / 2)
const y = (v) => PADT + innerH.value * (1 - (v - domain.value.lo) / (domain.value.hi - domain.value.lo))
const baseY = computed(() => y(0))
const showZeroLine = computed(() => domain.value.lo < 0)
const fmt = (v) => (props.formatAxis ? props.formatAxis(v) : props.pct ? `${Math.round(v * 100)}%` : Math.round(v))
const lines = computed(() => props.series.map((s, si) => {
  const pts = props.data.map((d, i) => ({ x: x(i), y: y(d.values?.[si] || 0), v: d.values?.[si] || 0, label: d.label }))
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const area = pts.length ? `${path} L${pts[pts.length - 1].x.toFixed(1)} ${baseY.value.toFixed(1)} L${pts[0].x.toFixed(1)} ${baseY.value.toFixed(1)} Z` : ''
  return { ...s, pts, path, area }
}))
// Per-index hover bands.
const hover = ref(-1)
const bands = computed(() => props.data.map((d, i) => {
  const cx = x(i)
  const half = (stepX.value || innerW.value) / 2
  const bx = props.data.length > 1 ? Math.max(PADL, cx - half) : PADL
  const bw = props.data.length > 1 ? (i === 0 || i === props.data.length - 1 ? half + (cx - bx) : half * 2) : innerW.value
  return { i, x: bx, w: bw }
}))
const tip = computed(() => {
  if (hover.value < 0 || !props.data[hover.value]) return null
  const i = hover.value
  const tops = props.series.map((_, si) => y(props.data[i].values?.[si] || 0))
  return {
    x: x(i),
    y: Math.min(...tops),
    title: props.data[i].label,
    rows: props.series.map((s, si) => {
      const v = props.data[i].values?.[si] || 0
      return props.pct ? { name: s.name, color: s.color, text: fmt(v) } : { name: s.name, color: s.color, amount: v }
    }),
  }
})
</script>

<template>
  <div>
    <div ref="wrap" class="relative w-full">
      <svg :viewBox="`0 0 ${W} ${height}`" class="w-full" :style="{ height: `${height}px` }">
        <g>
          <template v-for="(t, i) in ticks" :key="i">
            <line :x1="PADL" :x2="W - PADR" :y1="y(t)" :y2="y(t)" stroke="var(--border)" stroke-width="1" opacity="0.45" />
            <text :x="PADL - 6" :y="y(t) + 3" text-anchor="end" class="fill-muted-foreground" style="font-size: 10px">{{ fmt(t) }}</text>
          </template>
          <line v-if="showZeroLine" :x1="PADL" :x2="W - PADR" :y1="baseY" :y2="baseY" stroke="var(--border)" stroke-width="1.5" />
        </g>
        <!-- hover guide -->
        <line v-if="hover >= 0" :x1="x(hover)" :x2="x(hover)" :y1="PADT" :y2="PADT + innerH" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3" />
        <g v-for="(l, li) in lines" :key="li">
          <path v-if="l.area" :d="l.area" :fill="l.color" opacity="0.12" />
          <path :d="l.path" fill="none" :stroke="l.color" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          <circle v-for="(p, pi) in l.pts" :key="pi" :cx="p.x" :cy="p.y" :r="hover === pi ? 4.5 : 3" :fill="l.color" :stroke="hover === pi ? 'var(--background)' : 'none'" :stroke-width="hover === pi ? 1.5 : 0" />
        </g>
        <g>
          <text v-for="(d, di) in data" :key="di" :x="x(di)" :y="height - 8" text-anchor="middle" class="fill-muted-foreground" style="font-size: 10px">{{ d.label }}</text>
        </g>
        <!-- hover bands (on top, transparent) -->
        <g @mouseleave="hover = -1">
          <rect v-for="b in bands" :key="b.i" :x="b.x" :y="PADT" :width="b.w" :height="innerH" fill="transparent" @mouseenter="hover = b.i" @mousemove="hover = b.i" />
        </g>
      </svg>
      <ChartTooltip :show="!!tip" :x="tip?.x || 0" :y="tip?.y || 0" :bound="W" :title="tip?.title || ''" :rows="tip?.rows || []" :currency="currency" />
    </div>
    <div v-if="series.length > 1" class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span v-for="(s, i) in series" :key="i" class="flex items-center gap-1.5 text-xs text-muted-foreground"><span class="size-2.5 rounded-full" :style="{ background: s.color }" />{{ s.name }}</span>
    </div>
  </div>
</template>
