<script setup>
// Vertical bar chart — grouped (clustered) or stacked. Responsive: the viewBox
// tracks the container width (via useElementSize) so bars/text never distort.
// Hovering a month column shows a styled tooltip with every series' value.
import { computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
const props = defineProps({
  data: { type: Array, default: () => [] }, // [{ label, values: number[] }]
  series: { type: Array, default: () => [] }, // [{ name, color }]
  stacked: { type: Boolean, default: false },
  height: { type: Number, default: 220 },
  currency: { type: String, default: undefined },
  formatAxis: { type: Function, default: (v) => Math.round(v) }, // minor → string
})
const wrap = ref(null)
const { width } = useElementSize(wrap)
const PADL = 46
const PADB = 24
const PADT = 10
const PADR = 8
const W = computed(() => Math.max(280, Math.round(width.value) || 640))
const innerW = computed(() => W.value - PADL - PADR)
const innerH = computed(() => props.height - PADT - PADB)
const maxVal = computed(() => {
  let m = 0
  for (const d of props.data) {
    if (props.stacked) m = Math.max(m, (d.values || []).reduce((s, v) => s + Math.max(0, v || 0), 0))
    else for (const v of d.values || []) m = Math.max(m, v || 0)
  }
  return m || 1
})
const ticks = computed(() => Array.from({ length: 5 }, (_, i) => (maxVal.value * i) / 4))
const groupW = computed(() => innerW.value / Math.max(1, props.data.length))
const y = (v) => PADT + innerH.value * (1 - v / maxVal.value)
const bars = computed(() => {
  const out = []
  props.data.forEach((d, gi) => {
    const gx = PADL + gi * groupW.value
    const vals = d.values || []
    if (props.stacked) {
      let acc = 0
      const bw = Math.min(48, groupW.value * 0.6)
      vals.forEach((v, si) => {
        const val = Math.max(0, v || 0)
        out.push({ x: gx + groupW.value / 2 - bw / 2, y: y(acc + val), w: bw, h: innerH.value * (val / maxVal.value), color: props.series[si]?.color })
        acc += val
      })
    }
    else {
      const k = Math.max(1, vals.length)
      const slot = (groupW.value * 0.7) / k
      const start = gx + groupW.value * 0.15
      vals.forEach((v, si) => {
        const val = Math.max(0, v || 0)
        out.push({ x: start + si * slot, y: y(val), w: Math.max(2, slot * 0.82), h: innerH.value * (val / maxVal.value), color: props.series[si]?.color })
      })
    }
  })
  return out
})
// One hover column per group: full-height hit area + tooltip anchor at the top.
const groups = computed(() => props.data.map((d, gi) => {
  const gx = PADL + gi * groupW.value
  const vals = d.values || []
  let topY = PADT + innerH.value
  if (props.stacked) topY = y(vals.reduce((s, v) => s + Math.max(0, v || 0), 0))
  else for (const v of vals) topY = Math.min(topY, y(Math.max(0, v || 0)))
  return { x: gx, w: groupW.value, cx: gx + groupW.value / 2, topY, label: d.label, rows: vals.map((v, si) => ({ name: props.series[si]?.name, color: props.series[si]?.color, amount: v || 0 })) }
}))
const tip = ref(null)
</script>

<template>
  <div>
    <div ref="wrap" class="relative w-full">
      <svg :viewBox="`0 0 ${W} ${height}`" class="w-full" :style="{ height: `${height}px` }">
        <g>
          <template v-for="(t, i) in ticks" :key="i">
            <line :x1="PADL" :x2="W - PADR" :y1="y(t)" :y2="y(t)" stroke="var(--border)" stroke-width="1" opacity="0.45" />
            <text :x="PADL - 6" :y="y(t) + 3" text-anchor="end" class="fill-muted-foreground" style="font-size: 10px">{{ formatAxis(t) }}</text>
          </template>
        </g>
        <g>
          <rect v-for="(b, i) in bars" :key="i" :x="b.x" :y="b.y" :width="b.w" :height="Math.max(0, b.h)" :fill="b.color" rx="3" />
        </g>
        <g>
          <text v-for="(d, gi) in data" :key="gi" :x="PADL + gi * groupW + groupW / 2" :y="height - 8" text-anchor="middle" class="fill-muted-foreground" style="font-size: 10px">{{ d.label }}</text>
        </g>
        <!-- hover columns (on top, transparent) -->
        <g @mouseleave="tip = null">
          <rect
            v-for="(g, gi) in groups" :key="gi" :x="g.x" :y="PADT" :width="g.w" :height="innerH" fill="transparent"
            @mouseenter="tip = { x: g.cx, y: g.topY, title: g.label, rows: g.rows }"
            @mousemove="tip = { x: g.cx, y: g.topY, title: g.label, rows: g.rows }"
          />
        </g>
      </svg>
      <ChartTooltip :show="!!tip" :x="tip?.x || 0" :y="tip?.y || 0" :bound="W" :title="tip?.title || ''" :rows="tip?.rows || []" :currency="currency" />
    </div>
    <div v-if="series.length > 1" class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span v-for="(s, i) in series" :key="i" class="flex items-center gap-1.5 text-xs text-muted-foreground"><span class="size-2.5 rounded-sm" :style="{ background: s.color }" />{{ s.name }}</span>
    </div>
  </div>
</template>
