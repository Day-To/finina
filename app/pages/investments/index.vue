<script setup>
// Investments overview — two entry cards (Mutual Funds, Stocks) + this month's
// investing snapshot.
import { computed } from 'vue'
import { TrendingUpIcon, LineChartIcon, PlusIcon, ChevronRightIcon } from '@lucide/vue'
import { investmentPools, investedTotal } from '@/domain/calc/index.js'
import { currentMonthId } from '@/lib/dates.js'

const inv = useInvestments()
const planStore = useInvestmentPlan()
const { code: currency } = useCurrency()
const monthId = currentMonthId()
const { month, exists } = useMonth(monthId)

const previews = computed(() => [
  { key: 'mf', to: '/investments/mutual-funds', label: 'Mutual Funds flow', pool: pools.value.mf, routing: planStore.mfRouting.value, holdings: inv.mutualFunds.value },
  { key: 'stocks', to: '/investments/stocks', label: 'Stocks flow', pool: pools.value.stocks, routing: planStore.stockRouting.value, holdings: inv.stocks.value },
].filter((p) => p.holdings.length))

// pool-only — drives the flow preview's spread tree
const pools = computed(() => (month.value ? investmentPools(month.value) : { mf: 0, stocks: 0 }))
// total invested this month = pool + counted direct routings (incl. direct-to-fund)
const invested = computed(() => (month.value ? investedTotal(month.value) : { mf: 0, stocks: 0, total: 0 }))
const hasPools = computed(() => invested.value.total > 0)

const cards = computed(() => [
  { to: '/investments/mutual-funds', icon: TrendingUpIcon, title: 'Mutual Funds', count: inv.mutualFunds.value.length, buckets: inv.bucketNamesFor('mutualFund').length, pool: invested.value.mf },
  { to: '/investments/stocks', icon: LineChartIcon, title: 'Stocks', count: inv.stocks.value.length, buckets: inv.bucketNamesFor('stock').length, pool: invested.value.stocks },
])
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Investments</h1>
      <p class="text-sm text-muted-foreground">Route your surplus into mutual funds and stocks.</p>
    </div>

    <div v-if="inv.loading.value" class="grid gap-4 sm:grid-cols-2">
      <UiSkeleton v-for="i in 2" :key="i" class="h-40" />
    </div>

    <EmptyState
      v-else-if="inv.isEmpty.value"
      title="No investments yet"
      description="Add the mutual funds and stocks you invest in, then design how your surplus is routed to them."
    >
      <template #icon><TrendingUpIcon class="size-6" /></template>
      <UiButton as-child><NuxtLink to="/investments/mutual-funds?add=1"><PlusIcon class="size-4" /> Add a fund</NuxtLink></UiButton>
      <UiButton variant="outline" as-child><NuxtLink to="/investments/stocks?add=1"><PlusIcon class="size-4" /> Add a stock</NuxtLink></UiButton>
    </EmptyState>

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2">
        <NuxtLink v-for="c in cards" :key="c.to" :to="c.to" class="group">
          <UiCard class="h-full transition group-hover:border-primary/50 group-hover:shadow-md">
            <UiCardHeader>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><component :is="c.icon" class="size-5" /></span>
                  <UiCardTitle>{{ c.title }}</UiCardTitle>
                </div>
                <ChevronRightIcon class="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
              </div>
            </UiCardHeader>
            <UiCardContent class="flex items-end justify-between">
              <div class="text-sm text-muted-foreground">{{ c.count }} holding{{ c.count === 1 ? '' : 's' }} · {{ c.buckets }} bucket{{ c.buckets === 1 ? '' : 's' }}</div>
              <div v-if="c.pool > 0" class="text-right">
                <p class="text-xs text-muted-foreground">this month</p>
                <MoneyValue :amount="c.pool" :currency="currency" variant="total" />
              </div>
            </UiCardContent>
          </UiCard>
        </NuxtLink>
      </div>

      <div v-if="previews.length" class="grid gap-4 sm:grid-cols-2">
        <InvestmentFlowMapperPreview
          v-for="p in previews"
          :key="p.key"
          :pool="p.pool"
          :model-value="p.routing"
          :holdings="p.holdings"
          :currency="currency"
          :pool-key="p.key"
          :label="p.label"
          @open="navigateTo(p.to)"
        />
      </div>

      <UiCard v-if="exists && hasPools">
        <UiCardContent class="flex flex-wrap items-center justify-between gap-3 py-4">
          <div class="flex items-center gap-2 text-sm">
            <span class="text-muted-foreground">Investing this month:</span>
            <span class="flex items-center gap-1">MF <MoneyValue :amount="invested.mf" :currency="currency" variant="total" /></span>
            <span class="text-muted-foreground">·</span>
            <span class="flex items-center gap-1">Stocks <MoneyValue :amount="invested.stocks" :currency="currency" variant="total" /></span>
          </div>
          <UiButton variant="link" as-child><NuxtLink :to="`/months/${monthId}`">View in month →</NuxtLink></UiButton>
        </UiCardContent>
      </UiCard>
      <p v-else class="text-sm text-muted-foreground">Tag a surplus line as <span class="font-medium">Mutual Funds</span> or <span class="font-medium">Stocks</span> in your plan to start routing money here.</p>
    </template>
  </div>
</template>
