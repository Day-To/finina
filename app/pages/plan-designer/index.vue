<script setup>
// S4 — Plan Designer chooser. Two entry points: the monthly plan (income, fixed &
// variable expenses, surplus split, money flow, to-dos) and the yearly plan (dated
// recurring expenses). Each card surfaces the active version label and links into
// the designer and its version history.
import { NotebookPenIcon, CalendarDaysIcon } from '@lucide/vue'

const monthly = usePlan('monthly')
const yearly = usePlan('yearly')

const cards = [
  {
    key: 'monthly',
    icon: NotebookPenIcon,
    title: 'Monthly plan',
    description: 'Income, fixed & variable expenses, surplus split, money flow, and to-dos.',
    plan: monthly,
    designerTo: '/plan-designer/monthly',
    historyTo: '/plan-designer/monthly/history',
  },
  {
    key: 'yearly',
    icon: CalendarDaysIcon,
    title: 'Yearly plan',
    description: 'Dated recurring fixed & variable expenses (e.g. insurance, renewals).',
    plan: yearly,
    designerTo: '/plan-designer/yearly',
    historyTo: '/plan-designer/yearly/history',
  },
]

function versionLabel(plan) {
  return plan.activeVersion.value?.label?.trim() || 'Untitled'
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Plan Designer</h1>
      <p class="text-sm text-muted-foreground">Design your reusable monthly and yearly plans, then materialize them into each month.</p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <UiCard v-for="card in cards" :key="card.key" class="flex flex-col">
        <UiCardHeader>
          <div class="flex items-start gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted text-foreground">
              <component :is="card.icon" class="size-5" />
            </div>
            <div class="min-w-0">
              <UiCardTitle>{{ card.title }}</UiCardTitle>
              <UiCardDescription>{{ card.description }}</UiCardDescription>
            </div>
          </div>
        </UiCardHeader>

        <UiCardContent class="flex-1 text-sm">
          <UiSkeleton v-if="card.plan.loading.value" class="h-5 w-48" />
          <p v-else-if="card.plan.hasActiveVersion.value">
            Active version:
            <span class="font-medium text-foreground">{{ versionLabel(card.plan) }}</span>
          </p>
          <p v-else class="text-muted-foreground">No active version yet</p>
        </UiCardContent>

        <UiCardFooter class="gap-2">
          <UiButton as-child>
            <NuxtLink :to="card.designerTo">Open designer</NuxtLink>
          </UiButton>
          <UiButton as-child variant="outline">
            <NuxtLink :to="card.historyTo">History</NuxtLink>
          </UiButton>
        </UiCardFooter>
      </UiCard>
    </div>
  </div>
</template>
