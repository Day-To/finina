<script setup>
// Read-only node for the full money map (Vue Flow). One component, styled by
// data.kind via an accent CSS color. Compact card: icon chip + eyebrow + label +
// amount (+ optional sub / badge). Left = incoming handle, right = outgoing.
import { Handle, Position } from '@vue-flow/core'
import { WalletIcon, LandmarkIcon, ReceiptIcon, PiggyBankIcon, TrendingUpIcon, LineChartIcon, TargetIcon, CoinsIcon, TriangleAlertIcon, BanknoteIcon } from '@lucide/vue'
import { cn } from '@/lib/utils'

const props = defineProps({ id: { type: String, default: '' }, data: { type: Object, default: () => ({}) } })

const ICON = {
  income: WalletIcon, account: LandmarkIcon, expense: ReceiptIcon, save: PiggyBankIcon,
  mf: TrendingUpIcon, stocks: LineChartIcon, bucket: TargetIcon, fund: CoinsIcon,
  stock: LineChartIcon, warn: TriangleAlertIcon, kept: BanknoteIcon,
}
const icon = () => ICON[props.data.kind] || WalletIcon
</script>

<template>
  <div
    :class="cn('group relative flex w-[210px] items-center gap-2.5 rounded-xl border px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md', data.dim && 'opacity-60')"
    :style="{
      borderColor: `color-mix(in srgb, ${data.accent} 40%, var(--border))`,
      backgroundColor: `color-mix(in srgb, color-mix(in srgb, ${data.accent} 40%, var(--border)) 5%, var(--card))`,
    }"
    tabindex="0"
    :aria-label="`${data.label}, ${data.amount}`"
  >
    <Handle type="target" :position="Position.Left" />

    <span class="grid size-9 shrink-0 place-items-center rounded-lg" :style="{ background: `color-mix(in srgb, ${data.accent} 16%, transparent)`, color: data.accent }">
      <component :is="icon()" class="size-4.5" />
    </span>

    <div class="min-w-0 flex-1">
      <p v-if="data.eyebrow" class="truncate text-[9px] font-semibold uppercase leading-none tracking-wider text-muted-foreground">{{ data.eyebrow }}</p>
      <p class="mt-0.5 break-words text-[13px] font-semibold leading-tight">{{ data.label }}</p>
      <div class="flex items-baseline gap-1.5">
        <MoneyValue :amount="data.amount" :currency="data.currency" variant="total" class="text-xs" />
        <span v-if="data.sub" class="shrink-0 truncate text-[10px] text-muted-foreground">{{ data.sub }}</span>
      </div>
      <p v-if="data.pct" class="truncate text-[9px] leading-tight text-muted-foreground">{{ data.pct }} of income</p>
    </div>

    <UiBadge v-if="data.badge" variant="outline" class="shrink-0 text-[9px] text-muted-foreground">{{ data.badge }}</UiBadge>

    <Handle type="source" :position="Position.Right" />
  </div>
</template>
