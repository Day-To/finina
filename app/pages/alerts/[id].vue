<script setup>
import { ref, computed, watch } from 'vue'
import { toast } from 'vue-sonner'
import { describeRecurrence } from '@/domain/calc/recurrence.js'
definePageMeta({ key: (route) => route.fullPath })

const route = useRoute()
const a = useAlerts()
const id = computed(() => route.params.id)
const alert = computed(() => a.alerts.value.find((x) => x.id === id.value) || null)
const formOpen = ref(false)
const fmt = (ms) => (ms == null ? '—' : new Date(ms).toLocaleString())
const tsFmt = (ts) => { const d = ts?.toDate?.() ?? (ts instanceof Date ? ts : null); return d ? d.toLocaleString() : '—' }
const tsMs = (ts) => ts?.toDate?.().getTime() ?? (ts instanceof Date ? ts.getTime() : (typeof ts === 'number' ? ts : 0))

// ROUND-4 FIX: gate on ACTUAL unread state. The Firestore converter re-parses (Zod) on
// every snapshot, so `alert` is a NEW object reference each snapshot and this reference
// watch re-fires constantly; without the readAt guard, markRead()'s readAt write would
// trigger a snapshot → new object → re-fire → write … an unbounded write loop.
watch(alert, (al) => {
  if (al?.lastFiredAt && tsMs(al.lastFiredAt) > tsMs(al.readAt)) a.markRead(al.id).catch(() => {})
}, { immediate: true })

const SNOOZE = [['10 min', 10 * 60_000], ['1 hour', 60 * 60_000]]
async function snoozeBy(ms) { try { await a.snooze(id.value, Date.now() + ms); toast.success('Snoozed') } catch { toast.error('Failed') } }
async function snoozeTomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); try { await a.snooze(id.value, d.getTime()); toast.success('Snoozed to tomorrow 9 AM') } catch { toast.error('Failed') } }
async function done() { try { await a.complete(id.value); toast.success('Marked done') } catch { toast.error('Failed') } }
async function reopenIt() { try { await a.reopen(id.value); toast.success('Reopened') } catch { toast.error('Failed') } } // ROUND-2: wires the previously-unused reopen()
async function toggleEnabled() { try { await a.setEnabled(id.value, alert.value.enabled === false); } catch { toast.error('Failed') } }
async function remove() { try { await a.purge(id.value); toast.success('Deleted'); navigateTo('/alerts') } catch { toast.error('Failed') } }
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <div v-if="a.loading.value"><UiSkeleton class="h-40" /></div>
    <EmptyState v-else-if="!alert" title="Reminder not found" description="It may have been deleted.">
      <UiButton @click="navigateTo('/alerts')">Back to reminders</UiButton>
    </EmptyState>

    <template v-else>
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold tracking-tight">{{ alert.title }}</h1>
          <p v-if="alert.description" class="mt-1 text-sm text-muted-foreground">{{ alert.description }}</p>
        </div>
        <UiButton variant="outline" size="sm" @click="formOpen = true">Edit</UiButton>
      </div>

      <UiCard><UiCardContent class="grid grid-cols-2 gap-4 py-4 text-sm">
        <div><p class="text-xs text-muted-foreground">Repeat</p><p>{{ describeRecurrence(alert.recurrence) }}</p></div>
        <div><p class="text-xs text-muted-foreground">Status</p><p class="capitalize">{{ alert.enabled === false ? 'Disabled' : alert.status }}</p></div>
        <div><p class="text-xs text-muted-foreground">Next</p><p>{{ alert.status === 'completed' ? '—' : fmt(alert.nextFireAt) }}</p></div>
        <div><p class="text-xs text-muted-foreground">Last fired</p><p>{{ tsFmt(alert.lastFiredAt) }}</p></div>
      </UiCardContent></UiCard>

      <div v-if="alert.attachments?.length" class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <a v-for="att in alert.attachments" :key="att.id" :href="att.url" target="_blank" rel="noopener" class="overflow-hidden rounded-md border">
          <img v-if="att.contentType.startsWith('image/')" :src="att.url" :alt="att.name" class="h-28 w-full object-cover">
          <div v-else class="flex h-28 items-center justify-center px-2 text-xs">{{ att.name }}</div>
        </a>
      </div>

      <div class="flex flex-wrap gap-2">
        <template v-if="alert.status === 'active'">
          <UiButton v-for="[label, ms] in SNOOZE" :key="label" variant="outline" size="sm" @click="snoozeBy(ms)">Snooze {{ label }}</UiButton>
          <UiButton variant="outline" size="sm" @click="snoozeTomorrow">Tomorrow 9 AM</UiButton>
          <UiButton size="sm" @click="done">Mark done</UiButton>
        </template>
        <UiButton v-if="alert.status === 'completed'" size="sm" @click="reopenIt">Reopen</UiButton>
        <UiButton variant="outline" size="sm" @click="toggleEnabled">{{ alert.enabled === false ? 'Enable' : 'Disable' }}</UiButton>
        <UiButton variant="ghost" size="sm" class="text-destructive" @click="remove">Delete</UiButton>
      </div>

      <AlertFormDialog v-model:open="formOpen" :alert="alert" />
    </template>
  </div>
</template>
