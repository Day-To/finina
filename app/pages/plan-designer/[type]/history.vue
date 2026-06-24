<script setup>
// S6 — Version history for a plan type ('monthly' | 'yearly'). Read-only timeline
// of immutable versions; View opens a details dialog, Restore branches a new
// active version from an older one (§15).
import { ref, computed, reactive } from 'vue'
import { toast } from 'vue-sonner'
import { HistoryIcon, ArrowLeftIcon } from '@lucide/vue'

const route = useRoute()
const type = route.params.type

const { versions, activeVersionId, loading, isEmpty } = usePlanHistory(type)
const { revertTo } = usePlan(type)

const typeLabel = computed(() => (type ? type.charAt(0).toUpperCase() + type.slice(1) : ''))
const isYearly = computed(() => type === 'yearly')
const designerLink = computed(() => `/plan-designer/${type}`)

// Shared busy flag — disables row actions while a restore is in flight.
const busy = ref(false)

function fallbackCurrency(version) {
  return version?.currency || undefined
}
function formatCreatedAt(version) {
  const ts = version?.createdAt
  const d = typeof ts?.toDate === 'function' ? ts.toDate() : ts instanceof Date ? ts : null
  return d ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}
function rowCount(version, key) {
  return Array.isArray(version?.[key]) ? version[key].length : 0
}
function sortedRows(rows) {
  return [...(rows || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

// ── View (read-only) ──────────────────────────────────────────────────────────
const view = reactive({ open: false, version: null })
function openView(version) {
  view.version = version
  view.open = true
}

// ── Restore confirm ─────────────────────────────────────────────────────────--
const restore = reactive({ open: false, version: null })
function askRestore(version) {
  restore.version = version
  restore.open = true
}
async function confirmRestore() {
  if (!restore.version) return
  busy.value = true
  try {
    await revertTo(restore.version.id)
    toast.success('Restored — new active version created')
    restore.open = false
  }
  catch {
    toast.error('Could not restore this version')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-2">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Version history</h1>
        <p class="text-sm text-muted-foreground">
          {{ typeLabel }} plan — every saved version, newest first.
        </p>
      </div>
      <UiButton variant="ghost" as-child>
        <NuxtLink to="/plan-designer"><ArrowLeftIcon class="size-4" /> Back</NuxtLink>
      </UiButton>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <UiSkeleton v-for="i in 4" :key="i" class="h-16" />
    </div>

    <!-- Empty -->
    <EmptyState
      v-else-if="isEmpty"
      title="No versions yet"
      :description="`Open the designer to create and save your first ${type} plan version.`"
    >
      <template #icon><HistoryIcon class="size-6" /></template>
      <UiButton as-child>
        <NuxtLink :to="designerLink">Open designer</NuxtLink>
      </UiButton>
    </EmptyState>

    <!-- Timeline -->
    <div v-else class="space-y-3">
      <VersionHistoryRow
        v-for="v in versions"
        :key="v.id"
        :version="v"
        :is-active="v.id === activeVersionId"
        :busy="busy"
        @view="openView(v)"
        @restore="askRestore(v)"
      />
    </div>

    <!-- View details (read-only) -->
    <UiDialog v-model:open="view.open">
      <UiDialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <UiDialogHeader>
          <UiDialogTitle>{{ view.version?.label?.trim() || 'Untitled version' }}</UiDialogTitle>
          <UiDialogDescription>
            Saved {{ formatCreatedAt(view.version) }}
          </UiDialogDescription>
        </UiDialogHeader>

        <div v-if="view.version" class="space-y-4 text-sm">
          <!-- Monthly -->
          <template v-if="!isYearly">
            <div class="flex items-center justify-between gap-2">
              <span class="text-muted-foreground">Income</span>
              <MoneyValue :amount="view.version.income ?? 0" :currency="fallbackCurrency(view.version)" variant="total" />
            </div>

            <section v-for="group in [
              { key: 'fixedExpenses', label: 'Fixed expenses' },
              { key: 'variableExpenses', label: 'Variable expenses' },
            ]" :key="group.key" class="space-y-2">
              <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {{ group.label }} ({{ rowCount(view.version, group.key) }})
              </h4>
              <p v-if="rowCount(view.version, group.key) === 0" class="text-sm text-muted-foreground">No rows.</p>
              <ul v-else class="space-y-1.5">
                <li v-for="row in sortedRows(view.version[group.key])" :key="row.id" class="flex items-center justify-between gap-3 rounded-md border p-2">
                  <span class="min-w-0 flex-1 truncate">
                    {{ row.item }}
                    <span v-if="row.isDailyBudget" class="ml-1 text-xs text-muted-foreground">· daily</span>
                  </span>
                  <MoneyValue :amount="row.amount ?? 0" :currency="fallbackCurrency(view.version)" class="shrink-0" />
                </li>
              </ul>
            </section>

            <section class="space-y-2">
              <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Surplus split ({{ rowCount(view.version, 'surplus') }})
              </h4>
              <p v-if="rowCount(view.version, 'surplus') === 0" class="text-sm text-muted-foreground">No rows.</p>
              <ul v-else class="space-y-1.5">
                <li v-for="row in sortedRows(view.version.surplus)" :key="row.id" class="flex items-center justify-between gap-3 rounded-md border p-2">
                  <span class="min-w-0 flex-1 truncate">{{ row.item }}</span>
                  <span v-if="row.mode === 'PCT'" class="shrink-0 tabular-nums">{{ row.value }}%</span>
                  <MoneyValue v-else :amount="row.value ?? 0" :currency="fallbackCurrency(view.version)" class="shrink-0" />
                </li>
              </ul>
            </section>
          </template>

          <!-- Yearly -->
          <template v-else>
            <section v-for="group in [
              { key: 'fixedExpenses', label: 'Fixed recurring' },
              { key: 'variableExpenses', label: 'Variable recurring' },
            ]" :key="group.key" class="space-y-2">
              <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {{ group.label }} ({{ rowCount(view.version, group.key) }})
              </h4>
              <p v-if="rowCount(view.version, group.key) === 0" class="text-sm text-muted-foreground">
                No rows.
              </p>
              <ul v-else class="space-y-1.5">
                <li
                  v-for="row in sortedRows(view.version[group.key])"
                  :key="row.id"
                  class="flex items-center justify-between gap-3 rounded-md border p-2"
                >
                  <div class="min-w-0">
                    <p class="truncate font-medium">{{ row.item }}</p>
                    <p class="text-xs text-muted-foreground">
                      due day {{ row.recurDay }} of month {{ row.recurMonth }}
                    </p>
                  </div>
                  <MoneyValue :amount="row.amount ?? 0" :currency="fallbackCurrency(view.version)" class="shrink-0" />
                </li>
              </ul>
            </section>
          </template>
        </div>

        <UiDialogFooter>
          <UiDialogClose as-child>
            <UiButton variant="outline">Close</UiButton>
          </UiDialogClose>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- Restore confirm -->
    <UiAlertDialog v-model:open="restore.open">
      <UiAlertDialogContent>
        <UiAlertDialogHeader>
          <UiAlertDialogTitle>Restore this version?</UiAlertDialogTitle>
          <UiAlertDialogDescription>
            This creates a new active version branched from it. Your existing versions stay untouched.
          </UiAlertDialogDescription>
        </UiAlertDialogHeader>
        <UiAlertDialogFooter>
          <UiAlertDialogCancel :disabled="busy">Cancel</UiAlertDialogCancel>
          <UiAlertDialogAction :disabled="busy" @click="confirmRestore">
            {{ busy ? 'Restoring…' : 'Restore' }}
          </UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>
  </div>
</template>
