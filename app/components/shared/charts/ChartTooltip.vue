<script setup>
// Floating, styled chart tooltip. Positioned absolutely inside a `relative`
// chart wrapper at (x, y) in that wrapper's pixel space. It auto-flips near the
// edges (horizontally against `bound`, vertically near the top) so it never
// spills outside the chart / gets clipped by the card. Rows show either a money
// `amount` (via MoneyValue) or pre-formatted `text`.
import { computed } from 'vue'
const props = defineProps({
  show: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  title: { type: String, default: '' },
  rows: { type: Array, default: () => [] }, // [{ name?, color?, amount?, text? }]
  currency: { type: String, default: undefined },
  bound: { type: Number, default: 0 }, // wrapper width, for horizontal clamping
})
const HALF = 96 // conservative half-width: when to flip horizontal anchoring
const transform = computed(() => {
  let tx = '-50%'
  if (props.bound) {
    if (props.x < HALF) tx = '0%'
    else if (props.x > props.bound - HALF) tx = '-100%'
  }
  const ty = props.y < 72 ? '10px' : 'calc(-100% - 10px)'
  return `translate(${tx}, ${ty})`
})
</script>

<template>
  <Transition enter-active-class="transition-opacity duration-100" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-100" leave-to-class="opacity-0">
    <div
      v-if="show"
      class="pointer-events-none absolute z-30 w-max min-w-[7rem] max-w-[14rem] rounded-lg border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md"
      :style="{ left: `${x}px`, top: `${y}px`, transform }"
    >
      <p v-if="title" class="mb-1 truncate text-xs font-semibold">{{ title }}</p>
      <div v-for="(r, i) in rows" :key="i" class="flex items-center gap-2 whitespace-nowrap text-xs leading-5">
        <span v-if="r.color" class="size-2 shrink-0 rounded-full" :style="{ background: r.color }" />
        <span v-if="r.name" class="min-w-0 truncate text-muted-foreground">{{ r.name }}</span>
        <MoneyValue v-if="r.amount != null" :amount="r.amount" :currency="currency" class="ml-auto pl-3 font-medium" />
        <span v-else-if="r.text != null" class="ml-auto pl-3 font-medium">{{ r.text }}</span>
      </div>
    </div>
  </Transition>
</template>
