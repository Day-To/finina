<script setup>
// S7 — Months list. Browse every materialized month, newest-first, grouped by
// year. Create a new month from a native month picker, then jump into it.
import { ref, computed } from 'vue'
import { toast } from 'vue-sonner'
import { CalendarIcon, PlusIcon } from '@lucide/vue'
import {
  yearOf,
  formatMonthLabel,
  currentMonthId,
  isMonthId,
} from '@/lib/dates.js'

const { months, loading, isEmpty } = useHomeAnalysis()
const { currency: defaultCurrency } = useSettings()

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
          <UiButton
            v-for="m in group.items"
            :key="m.month"
            as-child
            variant="outline"
            class="h-auto w-full flex-col items-start gap-2 p-4 text-left"
          >
            <NuxtLink :to="`/months/${m.month}`">
              <div class="flex w-full items-start justify-between gap-2">
                <span class="font-medium">{{ formatMonthLabel(m.month) }}</span>
                <UiBadge :variant="m.seededFrom ? 'secondary' : 'outline'">
                  {{ m.seededFrom ? 'Planned' : 'Blank' }}
                </UiBadge>
              </div>
              <span class="text-xs font-normal text-muted-foreground">
                Income:
                <MoneyValue
                  :amount="m.income"
                  :currency="m.currency || defaultCurrency"
                  class="text-foreground"
                />
              </span>
            </NuxtLink>
          </UiButton>
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
  </div>
</template>
