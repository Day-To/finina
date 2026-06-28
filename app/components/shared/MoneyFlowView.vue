<script setup>
// Money-flow entry point on the month page: a compact, clickable CTA that opens
// the full-screen interactive money map (MoneyFlowCanvas) in a dialog. The CTA
// teases the macro split (spending / investing / saved); the map shows every node.
import { ref, computed } from 'vue'
import { Maximize2Icon, WaypointsIcon } from '@lucide/vue'
import { totalExpenses, investedTotal, surplusAmounts, directRoutings } from '@/domain/calc/index.js'

const props = defineProps({
  month: { type: Object, default: null },
  accounts: { type: Array, default: () => [] },
  accountsById: { type: Object, default: null },
  registry: { type: Array, default: () => [] },
  currency: { type: String, default: undefined },
  archivedFundIds: { type: Object, default: () => new Set() },
  pausedFundIds: { type: Object, default: () => new Set() },
})

const open = ref(false)
const income = computed(() => Math.max(0, props.month?.income ?? 0))
const spending = computed(() => (props.month ? totalExpenses(props.month) : 0))
// Investing = counted money (pool + counted direct). Saved = non-routed surplus +
// PARKED direct routings (money sent to a fund but tracked as saving).
const investing = computed(() => (props.month ? investedTotal(props.month).total : 0))
const saved = computed(() => {
  if (!props.month) return 0
  const nonRouted = surplusAmounts(props.month).filter((s) => !s.target).reduce((a, s) => a + s.amount, 0)
  const parked = directRoutings(props.month).filter((dRoute) => !dRoute.counted).reduce((a, dRoute) => a + dRoute.amount, 0)
  return nonRouted + parked
})
const pct = (v) => (income.value ? Math.round((v / income.value) * 100) : 0)

const chips = computed(() => [
  { label: 'Spending', amount: spending.value, color: 'var(--negative)' },
  { label: 'Investing', amount: investing.value, color: 'var(--invest)' },
  { label: 'Saved', amount: saved.value, color: 'var(--positive)' },
].filter((c) => c.amount > 0))
</script>

<template>
  <div>
    <button
      type="button"
      class="group w-full rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
      aria-haspopup="dialog"
      @click="open = true"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <WaypointsIcon class="size-5" />
          </span>
          <div>
            <p class="text-base font-semibold">Money flow</p>
            <p class="text-sm text-muted-foreground">See exactly where every rupee goes — accounts, each expense, and every fund &amp; stock.</p>
          </div>
        </div>
        <span class="flex shrink-0 items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium transition-colors group-hover:border-primary/40 group-hover:text-primary">
          <Maximize2Icon class="size-4" /> Open money map
        </span>
      </div>

      <!-- macro split bar -->
      <div v-if="income > 0" class="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div v-for="c in chips" :key="c.label" :style="{ width: `${pct(c.amount)}%`, background: c.color }" class="h-full" />
      </div>
      <div class="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        <span v-for="c in chips" :key="c.label" class="flex items-center gap-1.5 text-xs">
          <span class="size-2.5 rounded-full" :style="{ background: c.color }" />
          <span class="font-medium">{{ c.label }}</span>
          <MoneyValue :amount="c.amount" :currency="currency" variant="muted" class="text-xs" />
          <span class="text-muted-foreground">· {{ pct(c.amount) }}%</span>
        </span>
      </div>
    </button>

    <UiDialog v-model:open="open">
      <UiDialogContent class="flex h-screen max-h-screen w-screen max-w-[100vw] flex-col gap-0 rounded-none border-0 p-0 sm:max-w-[100vw]">
        <UiDialogTitle class="sr-only">Money map</UiDialogTitle>
        <UiDialogDescription class="sr-only">An end-to-end map of where this month’s money flows, from income to individual funds and stocks.</UiDialogDescription>
        <MoneyFlowCanvas
          v-if="open"
          :month="month"
          :accounts="accounts"
          :accounts-by-id="accountsById"
          :registry="registry"
          :currency="currency"
          :archived-fund-ids="archivedFundIds"
          :paused-fund-ids="pausedFundIds"
          @close="open = false"
        />
      </UiDialogContent>
    </UiDialog>
  </div>
</template>
