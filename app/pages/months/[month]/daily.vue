<script setup>
// S9 — Daily transactions for a month (mobile-first). Budget meter, grouped list
// by date, and a shared add/edit sheet. Money always via Money* components.
import { ref, reactive, computed } from 'vue'
import { toast } from 'vue-sonner'
import { ArrowLeftIcon, PlusIcon, ReceiptIcon, PencilIcon, Trash2Icon } from '@lucide/vue'
import { formatDateLabel, formatMonthLabel, elapsedDaysInMonth } from '@/lib/dates.js'

const route = useRoute()
const month = computed(() => route.params.month)

const { month: monthDoc, loading: monthLoading, exists } = useMonth(month)
const { loading: dailyLoading, isEmpty, summary, grouped, add, update, remove } = useDaily(month, monthDoc)

const currency = computed(() => monthDoc.value?.currency)
const monthLabel = computed(() => formatMonthLabel(month.value))
const setupHref = computed(() => `/months/${month.value}`)

// Add / edit (shared sheet) ----------------------------------------------
const formOpen = ref(false)
const editing = ref(null)
function openAdd() { editing.value = null; formOpen.value = true }
function openEdit(expense) { editing.value = expense; formOpen.value = true }
const onSave = (payload, id) => (id ? update(id, payload) : add(payload))

// Delete flow -------------------------------------------------------------
const del = reactive({ open: false, expense: null, busy: false })
function askDelete(expense) { del.expense = expense; del.open = true }
async function confirmDelete() {
  if (!del.expense) return
  del.busy = true
  try {
    await remove(del.expense.id)
    toast.success('Deleted')
    del.open = false
  }
  catch { toast.error('Could not delete expense') }
  finally { del.busy = false }
}
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <UiButton variant="ghost" size="sm" class="-ml-2 h-7 px-2 text-muted-foreground" as-child>
          <NuxtLink :to="setupHref"><ArrowLeftIcon class="size-4" /> Month</NuxtLink>
        </UiButton>
        <h1 class="truncate text-2xl font-semibold tracking-tight">Daily expenses</h1>
        <p class="text-sm text-muted-foreground">{{ monthLabel }}</p>
      </div>
      <UiButton class="shrink-0" :disabled="!exists" @click="openAdd">
        <PlusIcon class="size-4" /> Add
      </UiButton>
    </div>

    <!-- Loading -->
    <template v-if="monthLoading">
      <UiSkeleton class="h-24 w-full" />
      <UiSkeleton class="h-40 w-full" />
    </template>

    <!-- Month not set up yet -->
    <UiCard v-else-if="!exists">
      <UiCardHeader>
        <UiCardTitle>This month isn't set up yet</UiCardTitle>
        <UiCardDescription>Daily expenses need the month's currency and daily budget. Set up the month first.</UiCardDescription>
      </UiCardHeader>
      <UiCardFooter>
        <UiButton as-child><NuxtLink :to="setupHref">Set it up</NuxtLink></UiButton>
      </UiCardFooter>
    </UiCard>

    <template v-else>
      <!-- Budget meter -->
      <UiCard>
        <UiCardContent class="pt-6">
          <BudgetMeter :budget="summary.budget" :spent="summary.spent" :currency="currency" :per-day="summary.perDay" :elapsed-days="elapsedDaysInMonth(month)" />
        </UiCardContent>
      </UiCard>

      <UiSkeleton v-if="dailyLoading" class="h-40 w-full" />

      <EmptyState v-else-if="isEmpty" title="No expenses yet" description="Log what you spend day to day to track it against your budget.">
        <template #icon><ReceiptIcon class="size-6" /></template>
        <UiButton @click="openAdd"><PlusIcon class="size-4" /> Add your first expense</UiButton>
      </EmptyState>

      <!-- Grouped list (compact) -->
      <div v-else class="space-y-3">
        <section v-for="group in grouped" :key="group.date">
          <div class="flex items-baseline justify-between gap-2 px-1 pb-1">
            <h2 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ formatDateLabel(group.date) }}</h2>
            <MoneyValue :amount="group.total" :currency="currency" variant="muted" class="text-xs" />
          </div>
          <UiCard>
            <ul class="divide-y">
              <li v-for="item in group.items" :key="item.id" class="group flex items-center gap-3 px-3 py-2">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">{{ item.item }}</p>
                  <p v-if="item.note" class="truncate text-xs text-muted-foreground">{{ item.note }}</p>
                </div>
                <MoneyValue :amount="item.amount" :currency="currency" class="shrink-0 text-sm font-medium" />
                <div class="flex shrink-0 items-center gap-0.5">
                  <UiButton variant="ghost" size="icon" class="size-7 text-muted-foreground" aria-label="Edit expense" @click="openEdit(item)"><PencilIcon class="size-3.5" /></UiButton>
                  <UiButton variant="ghost" size="icon" class="size-7 text-muted-foreground hover:text-destructive" aria-label="Delete expense" @click="askDelete(item)"><Trash2Icon class="size-3.5" /></UiButton>
                </div>
              </li>
            </ul>
          </UiCard>
        </section>
      </div>
    </template>

    <!-- Shared add / edit sheet -->
    <ExpenseFormDialog v-model:open="formOpen" :month-id="month" :month-doc="monthDoc" :expense="editing" :on-save="onSave" />

    <!-- Delete confirm -->
    <UiAlertDialog v-model:open="del.open">
      <UiAlertDialogContent>
        <UiAlertDialogHeader>
          <UiAlertDialogTitle>Delete this expense?</UiAlertDialogTitle>
          <UiAlertDialogDescription>“{{ del.expense?.item }}” will be permanently removed. This can't be undone.</UiAlertDialogDescription>
        </UiAlertDialogHeader>
        <UiAlertDialogFooter>
          <UiAlertDialogCancel :disabled="del.busy">Cancel</UiAlertDialogCancel>
          <UiAlertDialogAction class="bg-destructive text-white hover:bg-destructive/90" :disabled="del.busy" @click="confirmDelete">{{ del.busy ? 'Deleting…' : 'Delete' }}</UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>
  </div>
</template>
