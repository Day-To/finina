<script setup>
// One investment pool's routing → an interactive node editor. Renders a compact
// preview inline; clicking opens the full-screen Vue Flow editor. Mirrors
// FlowMapper. emits update:modelValue (the routing array) + edit-as-list.
import { ref } from 'vue'

const props = defineProps({
  pool: { type: Number, default: 0 },
  modelValue: { type: Array, default: () => [] },
  holdings: { type: Array, default: () => [] },
  bucketOptions: { type: Array, default: () => [] },
  currency: { type: String, default: undefined },
  poolKey: { type: String, default: 'mf' },
  disabled: { type: Boolean, default: false },
  archivedFundIds: { type: Object, default: () => new Set() },
  pausedFundIds: { type: Object, default: () => new Set() },
})
const emit = defineEmits(['update:modelValue', 'edit-as-list'])
const open = ref(false)
const noun = props.poolKey === 'stocks' ? 'stock' : 'fund'
</script>

<template>
  <div>
    <div v-if="holdings.length === 0" class="flex flex-col items-center gap-3 rounded-md border border-dashed px-3 py-8 text-center">
      <p class="text-sm text-muted-foreground">Add a {{ noun }} first to map its investment flow.</p>
      <UiButton variant="outline" size="sm" as-child>
        <NuxtLink :to="`/investments/${poolKey === 'stocks' ? 'stocks' : 'mutual-funds'}?add=1`">Add {{ noun }}</NuxtLink>
      </UiButton>
    </div>

    <template v-else>
      <InvestmentFlowMapperPreview
        :pool="pool"
        :model-value="modelValue"
        :holdings="holdings"
        :currency="currency"
        :pool-key="poolKey"
        :archived-fund-ids="archivedFundIds"
        :paused-fund-ids="pausedFundIds"
        @open="open = true"
      />

      <UiDialog v-model:open="open">
        <UiDialogContent class="flex h-screen max-h-screen w-screen max-w-[100vw] flex-col gap-0 rounded-none border-0 p-0 sm:max-w-[100vw]">
          <UiDialogTitle class="sr-only">Investment flow editor</UiDialogTitle>
          <UiDialogDescription class="sr-only">Route this pool to buckets and funds.</UiDialogDescription>
          <InvestmentFlowEditor
            v-if="open"
            :pool="pool"
            :model-value="modelValue"
            :holdings="holdings"
            :bucket-options="bucketOptions"
            :currency="currency"
            :pool-key="poolKey"
            :disabled="disabled"
            :archived-fund-ids="archivedFundIds"
            :paused-fund-ids="pausedFundIds"
            @update:model-value="emit('update:modelValue', $event)"
            @close="open = false"
            @edit-as-list="open = false; emit('edit-as-list')"
          />
        </UiDialogContent>
      </UiDialog>
    </template>
  </div>
</template>
