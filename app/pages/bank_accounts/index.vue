<script setup>
// S2 — Bank Accounts. Active card grid + an Archived section. Deleting an account
// ARCHIVES it (soft-delete): past months keep resolving its name (badged
// "Archived"); it leaves pickers/new work. Restore or permanently delete from the
// Archived section (permanent delete warns — past months would lose the name).
import { ref, reactive } from 'vue'
import { toast } from 'vue-sonner'
import { LandmarkIcon, PlusIcon, MoreVerticalIcon, ChevronRightIcon } from '@lucide/vue'

const { activeAccounts, archivedAccounts, loading, isEmpty, archive, restore, purge, referencesFor, referencesInMonths } = useBankAccounts()

// Add / edit modal
const formOpen = ref(false)
const editing = ref(null)
function openAdd() { editing.value = null; formOpen.value = true }
function openEdit(account) { editing.value = account; formOpen.value = true }

function maskNumber(num) {
  if (!num) return '—'
  const s = String(num)
  return s.length <= 4 ? s : `•••• ${s.slice(-4)}`
}

// Archive flow (soft-delete)
const arch = reactive({ open: false, account: null, references: null, busy: false })
async function askArchive(account) {
  arch.account = account
  arch.references = null
  arch.open = true
  try { arch.references = await referencesFor(account.id) }
  catch { /* non-fatal — still allow archive */ }
}
async function confirmArchive() {
  if (!arch.account) return
  arch.busy = true
  try {
    await archive(arch.account.id)
    toast.success('Account archived', { action: { label: 'Undo', onClick: () => restore(arch.account.id).catch(() => {}) } })
    arch.open = false
  }
  catch { toast.error('Could not archive account') }
  finally { arch.busy = false }
}

// Archived section
const archivedOpen = ref(false)
const monthRefs = ref(null) // Map<id, count>
const refsState = ref('idle') // idle | loading | ready | error
async function loadMonthRefs() {
  if (refsState.value === 'loading') return
  refsState.value = 'loading'
  try { monthRefs.value = await referencesInMonths(); refsState.value = 'ready' }
  catch { refsState.value = 'error' }
}
function onToggleArchived(open) {
  archivedOpen.value = open
  if (open && refsState.value !== 'ready') loadMonthRefs()
}
const refCountFor = (id) => monthRefs.value?.get(id) ?? 0

async function doRestore(account) {
  try { await restore(account.id); toast.success('Account restored') }
  catch { toast.error('Could not restore account') }
}

// Permanent delete
const del = reactive({ open: false, account: null, busy: false, confirmed: false })
function askPurge(account) {
  del.account = account
  del.confirmed = false
  del.open = true
  if (refsState.value !== 'ready') loadMonthRefs()
}
async function confirmPurge() {
  if (!del.account || !del.confirmed) return
  del.busy = true
  try { await purge(del.account.id); toast.success('Account permanently deleted'); del.open = false }
  catch { toast.error('Could not delete account') }
  finally { del.busy = false }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Bank Accounts</h1>
        <p class="text-sm text-muted-foreground">Your accounts — identities only, no balances.</p>
      </div>
      <UiButton @click="openAdd"><PlusIcon class="size-4" /> Add account</UiButton>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UiSkeleton v-for="i in 3" :key="i" class="h-40" />
    </div>

    <!-- Empty (no active accounts) -->
    <EmptyState
      v-else-if="isEmpty && !archivedAccounts.length"
      title="No bank accounts yet"
      description="Add the accounts you use so you can map your money flow when planning."
    >
      <template #icon><LandmarkIcon class="size-6" /></template>
      <UiButton @click="openAdd"><PlusIcon class="size-4" /> Add your first account</UiButton>
    </EmptyState>

    <!-- Active grid -->
    <div v-else-if="activeAccounts.length" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UiCard v-for="acc in activeAccounts" :key="acc.id" class="flex flex-col">
        <UiCardHeader>
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <UiCardTitle class="truncate">{{ acc.name }}</UiCardTitle>
              <UiCardDescription class="truncate">{{ acc.bankName || 'Bank' }}</UiCardDescription>
            </div>
            <UiDropdownMenu>
              <UiDropdownMenuTrigger as-child>
                <UiButton variant="ghost" size="icon" class="size-8 shrink-0" aria-label="Account actions">
                  <MoreVerticalIcon class="size-4" />
                </UiButton>
              </UiDropdownMenuTrigger>
              <UiDropdownMenuContent align="end">
                <UiDropdownMenuItem @click="openEdit(acc)">Edit</UiDropdownMenuItem>
                <UiDropdownMenuItem @click="askArchive(acc)">Archive</UiDropdownMenuItem>
              </UiDropdownMenuContent>
            </UiDropdownMenu>
          </div>
        </UiCardHeader>

        <UiCardContent class="flex-1 space-y-3 text-sm">
          <p v-if="acc.accountNumber" class="font-mono">{{ maskNumber(acc.accountNumber) }}</p>
          <p v-if="acc.ifsc" class="text-muted-foreground">IFSC: <span class="font-mono">{{ acc.ifsc }}</span></p>
          <div v-if="acc.tags?.length" class="flex flex-wrap gap-1">
            <UiBadge v-for="t in acc.tags" :key="t" variant="secondary">{{ t }}</UiBadge>
          </div>
        </UiCardContent>
      </UiCard>
    </div>

    <p v-else class="text-sm text-muted-foreground">All your accounts are archived. Add one or restore from below.</p>

    <!-- Archived section -->
    <UiCollapsible v-if="archivedAccounts.length" :open="archivedOpen" @update:open="onToggleArchived">
      <UiCollapsibleTrigger as-child>
        <button type="button" class="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground" :aria-expanded="archivedOpen">
          <ChevronRightIcon class="size-4 transition-transform" :class="archivedOpen && 'rotate-90'" />
          Archived ({{ archivedAccounts.length }})
        </button>
      </UiCollapsibleTrigger>
      <UiCollapsibleContent class="pt-3">
        <ul class="divide-y rounded-md border">
          <li v-for="acc in archivedAccounts" :key="acc.id" class="flex items-center gap-3 px-3 py-2.5 opacity-80">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <p class="truncate text-sm font-medium">{{ acc.name }}</p>
                <UiBadge variant="outline" class="shrink-0 text-muted-foreground">Archived</UiBadge>
              </div>
              <p class="truncate text-xs text-muted-foreground">
                {{ acc.bankName || 'Bank' }} · {{ maskNumber(acc.accountNumber) }}
                <span v-if="refsState === 'loading'"> · checking…</span>
                <span v-else-if="refsState === 'error'"> · <button type="button" class="underline" @click="loadMonthRefs">couldn’t check · retry</button></span>
                <span v-else-if="refsState === 'ready'"> · {{ refCountFor(acc.id) ? `referenced by ${refCountFor(acc.id)} past month(s)` : 'not referenced by any past month' }}</span>
              </p>
            </div>
            <UiDropdownMenu>
              <UiDropdownMenuTrigger as-child>
                <UiButton variant="ghost" size="icon" class="size-8 shrink-0" aria-label="Archived account actions"><MoreVerticalIcon class="size-4" /></UiButton>
              </UiDropdownMenuTrigger>
              <UiDropdownMenuContent align="end">
                <UiDropdownMenuItem @click="doRestore(acc)">Restore</UiDropdownMenuItem>
                <UiDropdownMenuItem class="text-destructive" @click="askPurge(acc)">Delete forever</UiDropdownMenuItem>
              </UiDropdownMenuContent>
            </UiDropdownMenu>
          </li>
        </ul>
      </UiCollapsibleContent>
    </UiCollapsible>

    <!-- Archive confirm (soft, not destructive) -->
    <UiAlertDialog v-model:open="arch.open">
      <UiAlertDialogContent>
        <UiAlertDialogHeader>
          <UiAlertDialogTitle>Archive “{{ arch.account?.name }}”?</UiAlertDialogTitle>
          <UiAlertDialogDescription>
            Archiving removes this account from pickers and new months going forward. Past months stay exactly as they are and keep showing it with an Archived tag. You can restore it any time.
            <span v-if="arch.references?.referenced" class="mt-2 block text-muted-foreground">
              Currently used by your active monthly plan{{ arch.references.asIncome ? ' (income lands here)' : '' }}<span v-if="arch.references.allocationCount"> · {{ arch.references.allocationCount }} allocation(s)</span>.
            </span>
          </UiAlertDialogDescription>
        </UiAlertDialogHeader>
        <UiAlertDialogFooter>
          <UiAlertDialogCancel :disabled="arch.busy">Cancel</UiAlertDialogCancel>
          <UiAlertDialogAction :disabled="arch.busy" @click="confirmArchive">{{ arch.busy ? 'Archiving…' : 'Archive' }}</UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>

    <!-- Permanent delete (destructive, gated) -->
    <UiAlertDialog v-model:open="del.open">
      <UiAlertDialogContent>
        <UiAlertDialogHeader>
          <UiAlertDialogTitle>Permanently delete “{{ del.account?.name }}”?</UiAlertDialogTitle>
          <UiAlertDialogDescription>
            This can’t be undone. Any past month that referenced this account will no longer be able to show its name.
            <span class="mt-2 block font-medium">
              <span v-if="refsState === 'loading'">Checking past months…</span>
              <span v-else-if="refsState === 'ready'">Referenced by {{ refCountFor(del.account?.id) }} past month(s).</span>
              <span v-else>Couldn’t check past months.</span>
            </span>
          </UiAlertDialogDescription>
        </UiAlertDialogHeader>
        <label class="flex items-center gap-2 text-sm">
          <UiCheckbox :model-value="del.confirmed" @update:model-value="del.confirmed = !!$event" />
          I understand past months will lose this identity
        </label>
        <UiAlertDialogFooter>
          <UiAlertDialogCancel :disabled="del.busy">Cancel</UiAlertDialogCancel>
          <UiAlertDialogAction class="bg-destructive text-white hover:bg-destructive/90" :disabled="del.busy || !del.confirmed || refsState !== 'ready'" @click="confirmPurge">
            {{ del.busy ? 'Deleting…' : 'Delete forever' }}
          </UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>

    <!-- Add / edit modal -->
    <AccountFormDialog v-model:open="formOpen" :account="editing" />
  </div>
</template>
