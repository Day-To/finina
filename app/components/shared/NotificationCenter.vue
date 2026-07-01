<script setup>
import { toast } from 'vue-sonner'
const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['update:open'])
const a = useAlerts()
const fmt = (ms) => (ms == null ? '' : new Date(ms).toLocaleString())
const tsFmt = (ts) => { const d = ts?.toDate?.() ?? (ts instanceof Date ? ts : null); return d ? d.toLocaleString() : '' }
function go(id) { emit('update:open', false); navigateTo(`/alerts/${id}`) }
async function done(id) { try { await a.complete(id); toast.success('Done') } catch { toast.error('Failed') } }
async function dismiss(id) { try { await a.markRead(id) } catch { /* best-effort */ } } // ROUND-5: clear a fired item from the badge without leaving the center
</script>

<template>
  <UiSheet :open="open" @update:open="emit('update:open', $event)">
    <UiSheetContent side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
      <UiSheetHeader class="border-b px-4 py-3"><UiSheetTitle>Reminders</UiSheetTitle>
        <UiSheetDescription class="sr-only">Due and upcoming reminders</UiSheetDescription></UiSheetHeader>
      <div class="flex-1 overflow-y-auto p-3">
        <!-- ROUND-5: fired-but-unread completed alerts (drive the badge; appear in no active group) -->
        <div v-if="a.recentlyFired.value.length" class="mb-3">
          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recently fired</p>
          <ul class="space-y-1">
            <li v-for="item in a.recentlyFired.value" :key="item.id" class="flex items-center gap-2 rounded-md border px-3 py-2">
              <button class="min-w-0 flex-1 text-left" @click="go(item.id)">
                <p class="truncate text-sm font-medium">{{ item.title }}</p>
                <p class="truncate text-xs text-muted-foreground">Fired {{ tsFmt(item.lastFiredAt) }}</p>
              </button>
              <UiButton variant="ghost" size="sm" class="h-7" @click="dismiss(item.id)">Dismiss</UiButton>
            </li>
          </ul>
        </div>
        <template v-for="grp in [
          { label: 'Overdue', items: a.overdue.value, tone: 'text-destructive' },
          { label: 'Due today', items: a.dueToday.value, tone: '' },
          { label: 'Upcoming', items: a.upcoming.value, tone: '' },
        ]" :key="grp.label">
          <div v-if="grp.items.length" class="mb-3">
            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground" :class="grp.tone">{{ grp.label }}</p>
            <ul class="space-y-1">
              <li v-for="item in grp.items" :key="item.id" class="flex items-center gap-2 rounded-md border px-3 py-2">
                <button class="min-w-0 flex-1 text-left" @click="go(item.id)">
                  <p class="truncate text-sm font-medium">{{ item.title }}</p>
                  <p class="truncate text-xs text-muted-foreground">{{ fmt(item.nextFireAt) }}</p>
                </button>
                <UiButton variant="ghost" size="sm" class="h-7" @click="done(item.id)">Done</UiButton>
              </li>
            </ul>
          </div>
        </template>
        <p v-if="!a.recentlyFired.value.length && !a.overdue.value.length && !a.dueToday.value.length && !a.upcoming.value.length" class="py-10 text-center text-sm text-muted-foreground">Nothing due. You’re all caught up.</p>
      </div>
    </UiSheetContent>
  </UiSheet>
</template>
