<script setup>
// Compact, static snapshot of the money flow shown inline in the wizard / month.
// Clicking opens the full-screen node editor. No Vue Flow mounted here.
import { computed } from 'vue'
import { Maximize2Icon } from '@lucide/vue'
import { cn } from '@/lib/utils'
import { deriveFlow, reconcileSummary } from '@/composables/useFlowGraph.js'

const props = defineProps({
  sources: { type: Array, default: () => [] },
  accounts: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({ incomeAccountId: null, allocations: [] }) },
  currency: { type: String, default: undefined },
  income: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['open'])

const d = computed(() => deriveFlow(props.sources, props.accounts, props.modelValue))
const summary = computed(() => reconcileSummary(d.value))
// Resolution runs over the full accounts (deriveFlow); the chip strip + count are
// driven by ACTIVE accounts so archived ones don't inflate the headline, while an
// archived-but-still-allocated account is shown explicitly with an Archived tag.
const activeChips = computed(() => props.accounts.filter((a) => !a.archived))
const chips = computed(() => activeChips.value.slice(0, 3))
const archivedWithUse = computed(() => props.accounts.filter((a) => a.archived && d.value.countFor(a.id) > 0))
const sourceDots = computed(() => Math.min(5, props.sources.length))
</script>

<template>
  <button
    type="button"
    class="group w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
    aria-haspopup="dialog"
    @click="emit('open')"
  >
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm font-medium">Money flow</p>
      <span class="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
        <Maximize2Icon class="size-3.5" /> Open editor
      </span>
    </div>

    <!-- mini income → sources → accounts glyph -->
    <div class="my-3 flex items-center gap-2">
      <span class="size-3 shrink-0 rounded-full bg-[var(--auto)]" />
      <span class="h-px min-w-4 flex-1 bg-border" />
      <span class="flex shrink-0 gap-1">
        <span v-for="i in sourceDots" :key="i" class="size-2 rounded-full bg-muted-foreground/40" />
        <span v-if="sources.length === 0" class="text-[10px] text-muted-foreground">no items</span>
      </span>
      <span class="h-px min-w-4 flex-1 bg-border" />
      <span class="flex shrink-0 gap-1">
        <span v-for="a in chips" :key="a.id" class="size-3 rounded-full bg-[var(--transfer-2)]" />
      </span>
    </div>

    <p class="text-sm text-muted-foreground">
      {{ d.assignedCount }}/{{ d.total }} items mapped → {{ activeChips.length }} account{{ activeChips.length === 1 ? '' : 's' }}
    </p>

    <div v-if="chips.length || archivedWithUse.length" class="mt-2 flex flex-wrap items-center gap-1.5">
      <span v-for="a in chips" :key="a.id" class="flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs">
        <span class="max-w-24 truncate">{{ a.name }}</span>
        <MoneyValue :amount="d.sumFor(a.id)" :currency="currency" variant="total" />
      </span>
      <span v-if="activeChips.length > 3" class="text-xs text-muted-foreground">+{{ activeChips.length - 3 }} more</span>
      <span v-for="a in archivedWithUse" :key="a.id" class="flex items-center gap-1 rounded-md border border-dashed bg-background px-2 py-0.5 text-xs text-muted-foreground">
        <span class="max-w-24 truncate">{{ a.name }}</span>
        <span>· Archived</span>
        <MoneyValue :amount="d.sumFor(a.id)" :currency="currency" variant="muted" />
      </span>
    </div>

    <span
      :class="cn('mt-3 inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium',
        d.balanced ? 'border-positive/40 bg-positive/10 text-positive' : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400')"
    >
      {{ d.balanced ? 'Reconciled' : `Needs attention · ${summary}` }}
    </span>
  </button>
</template>
