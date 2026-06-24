<script setup>
// Money-flow → accounts (§S5.5). Public API unchanged (sources/accounts/
// modelValue/currency/disabled + optional income); emits update:modelValue.
// Renders a compact preview inline; clicking opens a full-screen Vue Flow editor.
import { ref } from 'vue'

const props = defineProps({
  sources: { type: Array, default: () => [] },
  accounts: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({ incomeAccountId: null, allocations: [] }) },
  currency: { type: String, default: undefined },
  income: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const open = ref(false)
</script>

<template>
  <div>
    <!-- No accounts yet -->
    <div v-if="accounts.length === 0" class="flex flex-col items-center gap-3 rounded-md border border-dashed px-3 py-8 text-center">
      <p class="text-sm text-muted-foreground">Add a bank account first to map your money flow.</p>
      <UiButton variant="outline" size="sm" as-child>
        <NuxtLink to="/bank_accounts">Add bank account</NuxtLink>
      </UiButton>
    </div>

    <template v-else>
      <FlowMapperPreview
        :sources="sources"
        :accounts="accounts"
        :model-value="modelValue"
        :currency="currency"
        :income="income"
        @open="open = true"
      />

      <UiDialog v-model:open="open">
        <UiDialogContent class="flex h-screen max-h-screen w-screen max-w-[100vw] flex-col gap-0 rounded-none border-0 p-0 sm:max-w-[100vw]">
          <UiDialogTitle class="sr-only">Money flow editor</UiDialogTitle>
          <UiDialogDescription class="sr-only">Assign your income and expenses to bank accounts.</UiDialogDescription>
          <FlowGraphEditor
            v-if="open"
            :sources="sources"
            :accounts="accounts"
            :model-value="modelValue"
            :currency="currency"
            :income="income"
            :disabled="disabled"
            @update:model-value="emit('update:modelValue', $event)"
            @close="open = false"
          />
        </UiDialogContent>
      </UiDialog>
    </template>
  </div>
</template>
