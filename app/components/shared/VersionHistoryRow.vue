<script setup>
// One row in the plan version timeline (§S6). Emits view / restore.
import { computed } from 'vue'
import { ClockIcon } from '@lucide/vue'

const props = defineProps({
  version: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})
defineEmits(['view', 'restore'])

const when = computed(() => {
  const ts = props.version?.createdAt
  const d = typeof ts?.toDate === 'function' ? ts.toDate() : ts instanceof Date ? ts : null
  return d ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
})
const title = computed(() => props.version?.label?.trim() || 'Untitled version')
</script>

<template>
  <div class="flex items-center gap-3 rounded-lg border p-3">
    <div class="rounded-full bg-muted p-2 text-muted-foreground">
      <ClockIcon class="size-4" />
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <p class="truncate text-sm font-medium">{{ title }}</p>
        <UiBadge v-if="isActive" class="bg-positive text-positive-foreground">Active</UiBadge>
      </div>
      <p class="text-xs text-muted-foreground">{{ when }}</p>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <UiButton type="button" variant="ghost" size="sm" :disabled="busy" @click="$emit('view', version)">View</UiButton>
      <UiButton type="button" variant="outline" size="sm" :disabled="busy || isActive" @click="$emit('restore', version)">
        Restore
      </UiButton>
    </div>
  </div>
</template>
