<script setup>
// Prominent on-open alert: a modal dialog listing reminders that need attention.
// Auto-opens ONCE per app open (this component persists for the session in default.vue,
// so `autoShown` gates repeats within a session; a reload re-runs it). Driven by
// useAlerts().attention — the same set as the nav badge, so they always agree.
import { ref, watch } from 'vue'
import { BellRingIcon } from '@lucide/vue'

const a = useAlerts()
const open = ref(false)
let autoShown = false

const tsFmt = (ts) => { const d = ts?.toDate?.() ?? (ts instanceof Date ? ts : null); return d ? d.toLocaleString() : '' }
function whenLabel(item) {
  if (item.status === 'completed') return item.lastFiredAt ? `Fired ${tsFmt(item.lastFiredAt)}` : 'Fired'
  if (item.nextFireAt != null && item.nextFireAt <= a.now.value) return 'Due now'
  return item.nextFireAt != null ? new Date(item.nextFireAt).toLocaleString() : ''
}

// Auto-open when reminders are ready and something needs attention.
watch(() => a.attention.value.length, (count) => {
  if (!autoShown && !a.loading.value && count > 0) { autoShown = true; open.value = true }
}, { immediate: true })

async function markAllRead() {
  for (const item of a.attention.value) { try { await a.markRead(item.id) } catch { /* best-effort */ } }
}
async function dismiss() { open.value = false; await markAllRead() }        // acknowledge → clears badge, no re-popup
async function viewAll() { open.value = false; await markAllRead(); navigateTo('/alerts') }
function go(id) { open.value = false; navigateTo(`/alerts/${id}`) }           // detail page marks it read
</script>

<template>
  <UiDialog :open="open" @update:open="(v) => { if (!v) dismiss() }">
    <UiDialogContent class="sm:max-w-md">
      <UiDialogHeader>
        <div class="flex items-center gap-3">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BellRingIcon class="size-5" />
          </span>
          <div class="min-w-0">
            <UiDialogTitle>{{ a.attention.value.length === 1 ? 'A reminder needs your attention' : `${a.attention.value.length} reminders need your attention` }}</UiDialogTitle>
            <UiDialogDescription>Tap one to open it, or view all your reminders.</UiDialogDescription>
          </div>
        </div>
      </UiDialogHeader>

      <ul class="max-h-72 space-y-1.5 overflow-y-auto">
        <li v-for="item in a.attention.value" :key="item.id">
          <button type="button" class="w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent" @click="go(item.id)">
            <p class="truncate text-sm font-medium">{{ item.title }}</p>
            <p class="truncate text-xs text-muted-foreground">
              {{ whenLabel(item) }}<span v-if="item.description"> · {{ item.description }}</span>
            </p>
          </button>
        </li>
      </ul>

      <UiDialogFooter class="gap-2">
        <UiButton variant="ghost" @click="dismiss">Dismiss</UiButton>
        <UiButton @click="viewAll">View all reminders</UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>
