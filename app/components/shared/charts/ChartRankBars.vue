<script setup>
// Horizontal ranking bars (div-based) for "top categories / items" lists.
// Hovering a row shows a tooltip with its amount and share of the total.
import { computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
const props = defineProps({
  rows: { type: Array, default: () => [] }, // [{ label, value, sub?, color? }]
  color: { type: String, default: 'var(--primary)' },
  currency: { type: String, default: undefined },
  max: { type: Number, default: 0 },
})
const peak = computed(() => props.max || Math.max(1, ...props.rows.map((r) => r.value || 0)))
const total = computed(() => props.rows.reduce((s, r) => s + (r.value || 0), 0))
const wrap = ref(null)
const { width: boundW } = useElementSize(wrap)
const tip = ref(null)
function move(e, r) {
  const box = wrap.value?.getBoundingClientRect()
  if (!box) return
  tip.value = {
    x: e.clientX - box.left,
    y: e.clientY - box.top,
    title: r.sub ? `${r.label} · ${r.sub}` : r.label,
    rows: [{ amount: r.value, color: r.color || props.color }, { name: 'of total', text: `${Math.round(((r.value || 0) / (total.value || 1)) * 100)}%` }],
  }
}
</script>

<template>
  <div ref="wrap" class="relative">
    <ul class="space-y-3">
      <li v-for="r in rows" :key="r.label" @mousemove="move($event, r)" @mouseleave="tip = null">
        <div class="mb-1 flex items-baseline justify-between gap-2 text-sm">
          <span class="min-w-0 truncate">{{ r.label }}<span v-if="r.sub" class="ml-1.5 text-xs text-muted-foreground">{{ r.sub }}</span></span>
          <MoneyValue :amount="r.value" :currency="currency" class="shrink-0 font-medium" />
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-muted">
          <div class="h-full rounded-full transition-all duration-700 ease-out" :style="{ width: `${Math.max(2, (r.value / peak) * 100)}%`, background: r.color || color }" />
        </div>
      </li>
      <li v-if="!rows.length" class="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No data yet.</li>
    </ul>
    <ChartTooltip :show="!!tip" :x="tip?.x || 0" :y="tip?.y || 0" :bound="boundW" :title="tip?.title || ''" :rows="tip?.rows || []" :currency="currency" />
  </div>
</template>
