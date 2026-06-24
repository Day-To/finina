<script setup>
// "Account removed" bucket — appears when an allocation references a deleted
// account. Its expense leaves hang off its right handle. Reassign them to a real
// bank to clear it.
import { Handle, Position } from '@vue-flow/core'
import { TriangleAlertIcon } from '@lucide/vue'
import { NONE } from '@/composables/useFlowGraph.js'

defineProps({ id: { type: String, default: '' }, data: { type: Object, default: () => ({}) } })
</script>

<template>
  <div class="group relative w-56 rounded-2xl border-2 border-dashed border-negative/55 bg-card p-3.5 shadow-lg shadow-black/20">
    <div class="flex items-center gap-2 text-negative">
      <TriangleAlertIcon class="size-4" />
      <p class="text-sm font-semibold">Account removed</p>
    </div>
    <p class="mt-1 text-xs text-muted-foreground">{{ data.count }} item(s) — reassign to a bank.</p>
    <div class="mt-2">
      <UiSelect :model-value="NONE" :disabled="data.disabled" @update:model-value="data.onReassign?.($event)">
        <UiSelectTrigger class="nodrag nowheel h-8 w-full" aria-label="Reassign items to account">
          <UiSelectValue placeholder="Reassign to…" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem v-for="a in data.accounts" :key="a.id" :value="a.id">{{ a.name }}</UiSelectItem>
        </UiSelectContent>
      </UiSelect>
    </div>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>
