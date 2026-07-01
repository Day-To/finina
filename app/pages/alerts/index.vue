<script setup>
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { BellIcon, PlusIcon, MoreVerticalIcon } from '@lucide/vue'
import { describeRecurrence } from '@/domain/calc/recurrence.js'
const a = useAlerts()
const formOpen = ref(false); const editing = ref(null)
function openAdd() { editing.value = null; formOpen.value = true }
function openEdit(alert) { editing.value = alert; formOpen.value = true }
const fmt = (ms) => (ms == null ? '—' : new Date(ms).toLocaleString())

const del = ref({ open: false, alert: null, busy: false })
function askDelete(alert) { del.value = { open: true, alert, busy: false } }
async function confirmDelete() {
  del.value.busy = true
  try { await a.purge(del.value.alert.id); toast.success('Reminder deleted') ; del.value.open = false }
  catch { toast.error('Could not delete reminder') } finally { del.value.busy = false }
}
async function done(alert) { try { await a.complete(alert.id); toast.success('Marked done') } catch { toast.error('Failed') } }
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-2">
      <div><h1 class="text-2xl font-semibold tracking-tight">Reminders</h1>
        <p class="text-sm text-muted-foreground">Things to remember — they’ll surface in the app when due.</p></div>
      <UiButton @click="openAdd"><PlusIcon class="size-4" /> New reminder</UiButton>
    </div>

    <div v-if="a.loading.value" class="space-y-3"><UiSkeleton v-for="i in 3" :key="i" class="h-20" /></div>

    <EmptyState v-else-if="!a.overdue.value.length && !a.dueToday.value.length && !a.upcoming.value.length && !a.completed.value.length && !a.disabled.value.length"
      title="No reminders yet" description="Set your first reminder — “in 2 minutes”, “tomorrow”, or “in 1 year”.">
      <template #icon><BellIcon class="size-6" /></template>
      <UiButton @click="openAdd"><PlusIcon class="size-4" /> New reminder</UiButton>
    </EmptyState>

    <template v-else>
      <section v-for="grp in [
        { key: 'overdue', label: 'Overdue', items: a.overdue.value },
        { key: 'today', label: 'Due today', items: a.dueToday.value },
        { key: 'upcoming', label: 'Upcoming', items: a.upcoming.value },
        { key: 'completed', label: 'Completed', items: a.completed.value },
        { key: 'disabled', label: 'Disabled', items: a.disabled.value },
      ]" :key="grp.key" v-show="grp.items.length" class="space-y-2">
        <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ grp.label }}</h2>
        <ul class="divide-y rounded-md border">
          <li v-for="item in grp.items" :key="item.id" class="flex items-center gap-3 px-3 py-2.5"
            :class="grp.key === 'overdue' && 'bg-destructive/5'">
            <NuxtLink :to="`/alerts/${item.id}`" class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ item.title }}</p>
              <p class="truncate text-xs text-muted-foreground">
                {{ item.status === 'completed' ? 'Completed' : fmt(item.nextFireAt) }}
                <span v-if="item.recurrence.freq !== 'NONE'"> · {{ describeRecurrence(item.recurrence) }}</span>
              </p>
            </NuxtLink>
            <UiDropdownMenu>
              <UiDropdownMenuTrigger as-child><UiButton variant="ghost" size="icon" class="size-8" aria-label="Actions"><MoreVerticalIcon class="size-4" /></UiButton></UiDropdownMenuTrigger>
              <UiDropdownMenuContent align="end">
                <UiDropdownMenuItem @click="openEdit(item)">Edit</UiDropdownMenuItem>
                <UiDropdownMenuItem v-if="item.status === 'active'" @click="done(item)">Mark done</UiDropdownMenuItem>
                <UiDropdownMenuItem class="text-destructive" @click="askDelete(item)">Delete</UiDropdownMenuItem>
              </UiDropdownMenuContent>
            </UiDropdownMenu>
          </li>
        </ul>
      </section>
    </template>

    <UiAlertDialog v-model:open="del.open">
      <UiAlertDialogContent>
        <UiAlertDialogHeader><UiAlertDialogTitle>Delete “{{ del.alert?.title }}”?</UiAlertDialogTitle>
          <UiAlertDialogDescription>This permanently removes the reminder and its attachments. This can’t be undone.</UiAlertDialogDescription></UiAlertDialogHeader>
        <UiAlertDialogFooter>
          <UiAlertDialogCancel :disabled="del.busy">Cancel</UiAlertDialogCancel>
          <UiAlertDialogAction class="bg-destructive text-white hover:bg-destructive/90" :disabled="del.busy" @click="confirmDelete">{{ del.busy ? 'Deleting…' : 'Delete' }}</UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>

    <AlertFormDialog v-model:open="formOpen" :alert="editing" />
  </div>
</template>
