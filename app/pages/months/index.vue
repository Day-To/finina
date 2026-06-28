<script setup>
// S7 — Months list. Browse every materialized month, newest-first, grouped by
// year. Create a new month from a native month picker, then jump into it.
import { ref, computed } from 'vue'
import { toast } from 'vue-sonner'
import { CalendarIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import {
  yearOf,
  formatMonthLabel,
  currentMonthId,
  isMonthId,
} from '@/lib/dates.js'
import { totalExpenses, surplus, investedTotal } from '@/domain/calc/index.js'
import { monthsRepo } from '@/repositories/months.js'

const { months, loading, isEmpty } = useHomeAnalysis()
const { currency: defaultCurrency } = useSettings()
const auth = useAuthStore()

// "Invested" = money counted as investment this month (pool + counted direct
// routings); same KPI number the month's Overview strip shows.
const investedOf = (m) => investedTotal(m).total

// Group newest-first months into { year, items } buckets, years descending.
const byYear = computed(() => {
  const groups = new Map()
  for (const m of months.value) {
    const year = yearOf(m.month)
    if (!groups.has(year)) groups.set(year, [])
    groups.get(year).push(m)
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({ year, items }))
})

// New-month dialog
const dialogOpen = ref(false)
const picked = ref(currentMonthId())

function openNewMonth() {
  picked.value = currentMonthId()
  dialogOpen.value = true
}

async function confirmNewMonth() {
  const value = picked.value
  if (!isMonthId(value)) {
    toast.error('Pick a valid month')
    return
  }
  dialogOpen.value = false
  await navigateTo(`/months/${value}`)
}

// Delete a month (with confirmation). The list re-renders via its live subscription.
const del = ref({ open: false, month: null, busy: false })
function askDelete(m) { del.value = { open: true, month: m, busy: false } }
async function confirmDelete() {
  const m = del.value.month
  if (!m) return
  del.value.busy = true
  try {
    await monthsRepo.remove(auth.user.uid, m.month)
    del.value.open = false
    toast.success(`${formatMonthLabel(m.month)} deleted`)
  }
  catch {
    toast.error('Could not delete month')
    del.value.busy = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Months</h1>
        <p class="text-sm text-muted-foreground">Every month you're tracking, newest first.</p>
      </div>
      <UiButton @click="openNewMonth">
        <PlusIcon class="size-4" /> New month
      </UiButton>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <UiSkeleton class="h-6 w-24" />
      <div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <UiSkeleton v-for="i in 8" :key="i" class="h-28" />
      </div>
    </div>

    <!-- Empty -->
    <EmptyState
      v-else-if="isEmpty"
      title="No months yet"
      description="Create a month from your plan to start tracking."
    >
      <template #icon><CalendarIcon class="size-6" /></template>
      <UiButton @click="openNewMonth">
        <PlusIcon class="size-4" /> New month
      </UiButton>
    </EmptyState>

    <!-- Grouped by year -->
    <div v-else class="space-y-8">
      <section v-for="group in byYear" :key="group.year" class="space-y-3">
        <h2 class="text-lg font-semibold tracking-tight">{{ group.year }}</h2>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          <div v-for="m in group.items" :key="m.month" class="group relative">
            <UiButton
              as-child
              variant="outline"
              class="h-auto w-full flex-col items-start gap-3 p-4 text-left"
            >
              <NuxtLink :to="`/months/${m.month}`">
                <div class="flex w-full items-center gap-2 pr-7">
                  <span class="truncate font-medium">{{ formatMonthLabel(m.month) }}</span>
                  <UiBadge :variant="m.seededFrom ? 'secondary' : 'outline'" class="shrink-0">
                    {{ m.seededFrom ? 'Planned' : 'Blank' }}
                  </UiBadge>
                </div>
                <div class="grid w-full grid-cols-2 gap-x-3 gap-y-2">
                  <div class="flex flex-col gap-0.5">
                    <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Income</span>
                    <MoneyValue :amount="m.income ?? 0" :currency="m.currency || defaultCurrency" class="text-sm font-medium" />
                  </div>
                  <div class="flex flex-col gap-0.5">
                    <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Expense</span>
                    <MoneyValue :amount="totalExpenses(m)" :currency="m.currency || defaultCurrency" variant="negative" class="text-sm font-medium" />
                  </div>
                  <div class="flex flex-col gap-0.5">
                    <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Surplus</span>
                    <MoneyValue :amount="surplus(m)" :currency="m.currency || defaultCurrency" variant="auto" class="text-sm font-medium" />
                  </div>
                  <div class="flex flex-col gap-0.5">
                    <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Invested</span>
                    <MoneyValue :amount="investedOf(m)" :currency="m.currency || defaultCurrency" variant="invest" class="text-sm font-medium" />
                  </div>
                </div>
              </NuxtLink>
            </UiButton>
            <UiButton
              variant="ghost"
              size="icon"
              class="absolute right-1.5 top-1.5 z-10 size-7 text-muted-foreground/50 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              :aria-label="`Delete ${formatMonthLabel(m.month)}`"
              @click="askDelete(m)"
            >
              <Trash2Icon class="size-4" />
            </UiButton>
          </div>
        </div>
      </section>
    </div>

    <!-- New month dialog -->
    <UiDialog v-model:open="dialogOpen">
      <UiDialogContent>
        <UiDialogHeader>
          <UiDialogTitle>New month</UiDialogTitle>
          <UiDialogDescription>
            Pick a month to open. If it doesn't exist yet, you can create it from your plan.
          </UiDialogDescription>
        </UiDialogHeader>
        <div class="space-y-1.5">
          <UiLabel>Month</UiLabel>
          <MonthPicker v-model="picked" />
        </div>
        <UiDialogFooter>
          <UiDialogClose as-child>
            <UiButton variant="outline">Cancel</UiButton>
          </UiDialogClose>
          <UiButton :disabled="!isMonthId(picked)" @click="confirmNewMonth">Open month</UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- Delete confirm -->
    <UiAlertDialog v-model:open="del.open">
      <UiAlertDialogContent>
        <UiAlertDialogHeader>
          <UiAlertDialogTitle>Delete {{ del.month ? formatMonthLabel(del.month.month) : 'this month' }}?</UiAlertDialogTitle>
          <UiAlertDialogDescription>
            This permanently removes the month and everything in it — income, expenses, surplus routing, money flow, checklist and any daily expenses logged here. Your plans, accounts and investments aren’t affected. This can’t be undone.
          </UiAlertDialogDescription>
        </UiAlertDialogHeader>
        <UiAlertDialogFooter>
          <UiAlertDialogCancel :disabled="del.busy">Cancel</UiAlertDialogCancel>
          <UiAlertDialogAction :disabled="del.busy" class="bg-destructive text-white hover:bg-destructive/90" @click="confirmDelete">{{ del.busy ? 'Deleting…' : 'Delete' }}</UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>
  </div>
</template>
