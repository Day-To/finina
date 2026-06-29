<script setup>
// Pick an existing month to duplicate into the one being set up ("Copy another
// month"). Lazily loads the candidate months on open (newest-first), pre-selects
// the most recent, and emits the chosen month id. The actual copy is done by the
// caller (page → useMonth.copyFromMonth); this is a pure picker.
import { ref, computed, watch } from 'vue'
import { CopyIcon, CalendarIcon } from '@lucide/vue'
import { totalExpenses, surplus, investedTotal } from '@/domain/calc/index.js'
import { formatMonthLabel } from '@/lib/dates.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  // () => Promise<month[]> — candidate months, newest-first.
  loader: { type: Function, default: null },
})
const emit = defineEmits(['update:open', 'select'])

const { locale } = useSettings()

const dialogOpen = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const months = ref([])
const loading = ref(false)
const loadError = ref(false)
const selected = ref(null) // the chosen source month id

// Preview figures must match the COPY, which drops yearly one-offs (buildMonthCopy);
// so strip source:'YEARLY' lines before totalling, or the picker would advertise an
// expense/surplus the copied month won't actually have.
const notYearly = (l) => l?.source !== 'YEARLY'
const forStats = (m) => ({
  ...m,
  fixedExpenses: (m.fixedExpenses ?? []).filter(notYearly),
  variableExpenses: (m.variableExpenses ?? []).filter(notYearly),
  surplus: (m.surplus ?? []).filter(notYearly),
})

const rows = computed(() =>
  months.value.map((m) => {
    const v = forStats(m)
    return {
      month: m.month,
      label: formatMonthLabel(m.month, locale.value),
      badge: m.copiedFrom ? 'Copied' : m.seededFrom ? 'Planned' : 'Blank',
      badgeVariant: m.copiedFrom || m.seededFrom ? 'secondary' : 'outline',
      currency: m.currency,
      income: m.income ?? 0,
      expense: totalExpenses(v),
      surplus: surplus(v),
      invested: investedTotal(v).total,
    }
  }),
)

// Lazily (re)load candidates; pre-select the newest. Re-runnable for retry.
async function load() {
  if (!props.loader) return
  months.value = []
  selected.value = null
  loadError.value = false
  loading.value = true
  try {
    const list = await props.loader()
    months.value = list ?? []
    selected.value = months.value[0]?.month ?? null
  }
  catch {
    loadError.value = true
  }
  finally {
    loading.value = false
  }
}
watch(() => props.open, (isOpen) => { if (isOpen) load() })

function confirm() {
  if (!selected.value) return
  emit('select', selected.value)
}
</script>

<template>
  <UiDialog v-model:open="dialogOpen">
    <UiDialogContent class="sm:max-w-lg">
      <UiDialogHeader>
        <UiDialogTitle>Copy from another month</UiDialogTitle>
        <UiDialogDescription>
          Duplicates income, expenses, money flow, investment routing and checklist items.
          Checklist progress and daily spending start fresh; the source month’s yearly one-offs aren’t included.
        </UiDialogDescription>
      </UiDialogHeader>

      <!-- Loading -->
      <div v-if="loading" class="space-y-2.5">
        <UiSkeleton v-for="i in 3" :key="i" class="h-[4.5rem] w-full rounded-xl" />
      </div>

      <!-- Error -->
      <div v-else-if="loadError" class="flex flex-col items-center gap-3 rounded-xl border border-dashed px-3 py-10 text-center">
        <p class="text-sm text-muted-foreground">Couldn’t load your months.</p>
        <UiButton variant="outline" size="sm" @click="load">Try again</UiButton>
      </div>

      <!-- Empty -->
      <div v-else-if="!rows.length" class="flex flex-col items-center gap-2 rounded-xl border border-dashed px-3 py-10 text-center">
        <CalendarIcon class="size-6 text-muted-foreground" />
        <p class="text-sm text-muted-foreground">No other months to copy from yet.</p>
      </div>

      <!-- Candidate list -->
      <div v-else class="-mx-1 max-h-[min(60vh,26rem)] space-y-2 overflow-y-auto px-1 py-0.5">
        <button
          v-for="r in rows"
          :key="r.month"
          type="button"
          :aria-pressed="selected === r.month"
          class="w-full rounded-xl border-2 p-3 text-left transition-colors hover:border-foreground/25"
          :class="selected === r.month ? 'border-primary bg-primary/5' : 'border-border'"
          @click="selected = r.month"
        >
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate font-medium">{{ r.label }}</span>
            <UiBadge :variant="r.badgeVariant" class="shrink-0">{{ r.badge }}</UiBadge>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4">
            <div class="flex min-w-0 flex-col gap-0.5">
              <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Income</span>
              <MoneyValue :amount="r.income" :currency="r.currency" class="truncate text-xs font-medium" />
            </div>
            <div class="flex min-w-0 flex-col gap-0.5">
              <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Expense</span>
              <MoneyValue :amount="r.expense" :currency="r.currency" variant="negative" class="truncate text-xs font-medium" />
            </div>
            <div class="flex min-w-0 flex-col gap-0.5">
              <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Surplus</span>
              <MoneyValue :amount="r.surplus" :currency="r.currency" variant="auto" class="truncate text-xs font-medium" />
            </div>
            <div class="flex min-w-0 flex-col gap-0.5">
              <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Invested</span>
              <MoneyValue :amount="r.invested" :currency="r.currency" variant="invest" class="truncate text-xs font-medium" />
            </div>
          </div>
        </button>
      </div>

      <UiDialogFooter>
        <UiButton type="button" variant="ghost" @click="emit('update:open', false)">Cancel</UiButton>
        <UiButton type="button" :disabled="!selected" @click="confirm"><CopyIcon class="size-4" /> Copy month</UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>
