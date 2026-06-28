<script setup>
// Income node (root, BLUE). Pick the bank where income lands; from its "+" add a
// bank (blue transfer) or an expense (red leaf). Source handle on the right.
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { TriangleAlertIcon, ArrowDownToLineIcon } from '@lucide/vue'
import { NONE } from '@/composables/useFlowGraph.js'

const props = defineProps({ id: { type: String, default: '' }, data: { type: Object, default: () => ({}) } })

// Options are the active accounts; if income lands in a now-archived account,
// pin it (labeled) so the shadcn select trigger still shows its name.
const incomeOptions = computed(() => {
  const pick = props.data.pickableAccounts ?? props.data.accounts ?? []
  const sel = props.data.incomeAccountId
  if (sel && props.data.incomeArchived && !pick.some((a) => a.id === sel)) {
    const acc = (props.data.accounts ?? []).find((a) => a.id === sel)
    return [{ id: sel, name: acc?.name ?? '', archived: true }, ...pick]
  }
  return pick
})
</script>

<template>
  <div class="group relative w-64 rounded-2xl border-2 border-[var(--auto)]/55 bg-card p-3.5 shadow-lg shadow-black/20 ring-1 ring-[var(--auto)]/10">
    <div class="flex items-center gap-2">
      <span class="grid size-8 place-items-center rounded-xl bg-[var(--auto)]/15 text-[var(--auto)]">
        <ArrowDownToLineIcon class="size-4" />
      </span>
      <p class="text-xs font-semibold uppercase tracking-widest text-[var(--auto)]">Income</p>
    </div>

    <MoneyValue v-if="data.income" :amount="data.income" :currency="data.currency" variant="total" class="mt-2 block text-2xl font-bold" />

    <div class="mt-2.5">
      <UiSelect :model-value="data.incomeAccountId ?? NONE" :disabled="data.disabled" @update:model-value="data.onSetIncome?.($event)">
        <UiSelectTrigger class="nodrag nowheel h-9 w-full rounded-lg" aria-label="Income lands in account">
          <span v-if="data.incomeMissing" class="text-negative">Account removed</span>
          <UiSelectValue v-else placeholder="Lands in…" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem :value="NONE">Unassigned</UiSelectItem>
          <UiSelectItem v-for="a in incomeOptions" :key="a.id" :value="a.id">{{ a.name }}<span v-if="a.archived" class="text-muted-foreground"> · Archived</span></UiSelectItem>
        </UiSelectContent>
      </UiSelect>
    </div>

    <p v-if="data.incomeMissing" class="mt-1.5 flex items-center gap-1 text-xs font-medium text-negative">
      <TriangleAlertIcon class="size-3" /> account removed — pick another
    </p>
    <p v-else-if="data.incomeArchived" class="mt-1.5">
      <UiBadge variant="outline" class="text-muted-foreground">Archived</UiBadge>
    </p>
    <p v-else-if="data.firstRun" class="mt-1.5 text-xs text-muted-foreground">
      Click <span class="font-medium text-foreground">+</span> to send money to a bank or pay an expense.
    </p>

    <Handle type="source" :position="Position.Right" />
    <NodePlus
      name="Income"
      :can-add-bank="true"
      :can-add-expense="!!data.incomeAccountId && !data.incomeMissing"
      :available-accounts="data.availableAccounts"
      :unplaced-sources="data.unplacedSources"
      :currency="data.currency"
      :disabled="data.disabled"
      :always-visible="data.firstRun"
      :on-add-bank="(id) => data.onAddBank?.(id)"
      :on-add-expense="(sid) => data.onAddExpense?.(sid)"
    />
  </div>
</template>
