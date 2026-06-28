<script setup>
// Full-screen, scene-based "Start month" ritual — NOT a stepper form. An intro
// hero, then one immersive accent-themed scene per stage (transfers → fixed →
// variable → mutual funds → stocks → checklist). Every item you complete fires a
// spark burst + fills a progress ring; finishing a scene plays a milestone
// celebration that auto-glides to the next; the end is a confetti finale. Amounts
// are READ-ONLY; the only thing written back is the checklist done-state.
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import {
  SparklesIcon, ArrowRightLeftIcon, ReceiptIcon, TrendingUpIcon, ListChecksIcon,
  CoinsIcon, LandmarkIcon, CheckIcon, XIcon, ArrowLeftIcon, ArrowRightIcon, PartyPopperIcon, RocketIcon,
} from '@lucide/vue'
import { accountTransfers, investmentBreakdown } from '@/domain/calc/index.js'
import { formatMoney } from '@/domain/money.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  month: { type: Object, default: null },
  monthLabel: { type: String, default: 'this month' },
  accountsById: { type: Object, default: () => new Map() }, // Map<id,{name}>
  registry: { type: Array, default: () => [] }, // investments (breakdown fallback)
})
const emit = defineEmits(['update:open', 'complete'])

const working = ref(null) // snapshot of the month taken on open
const current = ref(0)
const dir = ref(1) // scene transition direction
const doneSet = ref(new Set())
const started = ref(false) // intro dismissed
const milestone = ref(false) // step-complete celebration showing
const celebrating = ref(false) // finale showing
const confetti = ref([])
const rootEl = ref(null)
let advanceTimer = null
let rafId = null

const currency = computed(() => working.value?.currency)
const nameOf = (id) => props.accountsById?.get?.(id)?.name ?? 'account'
const fmt = (n) => formatMoney(n || 0, currency.value)
const checklistDoneFor = (accId) => (working.value?.checklist ?? []).find((c) => c.accountId === accId)?.isDone ?? false

// ── Scene content (derived from the snapshot) ─────────────────────────────────
const transferItems = computed(() => {
  const m = working.value
  if (!m) return []
  const incomeId = m.flow?.incomeAccountId
  const out = []
  for (const [accId, amt] of accountTransfers(m)) {
    if (amt <= 0 || accId === incomeId) continue
    out.push({ accountId: accId, name: nameOf(accId), amount: amt })
  }
  return out.sort((a, b) => b.amount - a.amount)
})

function groupExpenses(kind) {
  const m = working.value
  if (!m) return []
  const incomeId = m.flow?.incomeAccountId
  const acctOf = new Map()
  for (const a of m.flow?.allocations ?? []) for (const sid of a.sourceIds ?? []) acctOf.set(sid, a.accountId)
  const groups = new Map()
  for (const l of m[kind] ?? []) {
    if (!l.amount) continue
    const acc = acctOf.get(l.id) ?? incomeId ?? '∅'
    if (!groups.has(acc)) groups.set(acc, [])
    groups.get(acc).push(l)
  }
  return [...groups.entries()].map(([accId, items]) => ({
    accountId: accId,
    name: accId === '∅' ? 'Unassigned' : nameOf(accId),
    isIncome: accId === incomeId,
    items,
    total: items.reduce((s, l) => s + (l.amount || 0), 0),
  }))
}
const fixedGroups = computed(() => groupExpenses('fixedExpenses'))
const variableGroups = computed(() => groupExpenses('variableExpenses'))

const breakdown = computed(() => (working.value ? investmentBreakdown(working.value, props.registry) : null))
// Move-list = pool spread leaves + DIRECT routings (you physically move parked
// money too). dkey is stable + collision-free: pool = allocId:fundId; direct =
// direct:fundId. `investAmount` (≤ amount) feeds the counted-only "Invested" stat.
const sideItems = (side) => {
  const b = breakdown.value?.[side]
  if (!b) return []
  const pool = (b.holdings ?? []).filter((h) => h.amount > 0).map((h) => ({ name: h.name, amount: h.amount, investAmount: h.amount, dkey: `${h.allocId}:${h.id}` }))
  const direct = (b.direct ?? []).filter((dd) => dd.amount > 0).map((dd) => ({ name: dd.name, amount: dd.amount, investAmount: dd.investAmount, parked: dd.investAmount === 0, partParked: dd.investAmount > 0 && dd.parked > 0, dkey: `direct:${dd.fundId}` }))
  return [...pool, ...direct]
}
const mfItems = computed(() => sideItems('mf'))
const stockItems = computed(() => sideItems('stocks'))

const ACCENT = { transfers: 'var(--auto)', fixed: 'var(--negative)', variable: 'var(--negative)', mf: 'var(--positive)', stocks: 'var(--positive)', checklist: 'var(--primary)' }
const steps = computed(() => {
  const s = []
  if (transferItems.value.length) s.push({ key: 'transfers', title: 'Move the money', subtitle: 'Make each bank transfer, then tap to confirm.', icon: ArrowRightLeftIcon })
  if (fixedGroups.value.length) s.push({ key: 'fixed', title: 'Pay fixed expenses', subtitle: 'Pay each one from the account shown.', icon: ReceiptIcon })
  if (variableGroups.value.length) s.push({ key: 'variable', title: 'Pay variable expenses', subtitle: 'Pay each one from the account shown.', icon: ReceiptIcon })
  if (mfItems.value.length) s.push({ key: 'mf', title: 'Fund your mutual funds', subtitle: 'Invest the amount into each fund.', icon: TrendingUpIcon })
  if (stockItems.value.length) s.push({ key: 'stocks', title: 'Buy your stocks', subtitle: 'Invest the amount into each holding.', icon: TrendingUpIcon })
  s.push({ key: 'checklist', title: 'Final check', subtitle: 'Make sure nothing is left undone.', icon: ListChecksIcon })
  return s
})
const step = computed(() => steps.value[current.value] ?? null)
const isLast = computed(() => current.value === steps.value.length - 1)
const stepAccent = computed(() => ACCENT[step.value?.key] ?? 'var(--primary)')
const tint = (color, pct) => `color-mix(in oklab, ${color} ${pct}%, transparent)`

// ── Done model (one Set, stable keys) ─────────────────────────────────────────
const isDone = (k) => doneSet.value.has(k)
function setKeys(keys, on) {
  const n = new Set(doneSet.value)
  for (const k of keys) (on ? n.add(k) : n.delete(k))
  doneSet.value = n
}
function toggle(k) { setKeys([k], !isDone(k)); scheduleAdvanceIfComplete() }

function checkItemDone(c) {
  if (c.accountId === 'inv:mf') return mfItems.value.length ? mfItems.value.every((f) => isDone('mf:' + f.dkey)) : c.isDone
  if (c.accountId === 'inv:stocks') return stockItems.value.length ? stockItems.value.every((f) => isDone('st:' + f.dkey)) : c.isDone
  if (c.accountId && transferItems.value.some((t) => t.accountId === c.accountId)) return isDone('tf:' + c.accountId)
  return isDone('ck:' + c.id)
}
function toggleCheckItem(c) {
  if (c.accountId === 'inv:mf') setKeys(mfItems.value.map((f) => 'mf:' + f.dkey), !checkItemDone(c))
  else if (c.accountId === 'inv:stocks') setKeys(stockItems.value.map((f) => 'st:' + f.dkey), !checkItemDone(c))
  else if (c.accountId && transferItems.value.some((t) => t.accountId === c.accountId)) setKeys(['tf:' + c.accountId], !isDone('tf:' + c.accountId))
  else setKeys(['ck:' + c.id], !isDone('ck:' + c.id))
  scheduleAdvanceIfComplete()
}

const stepComplete = computed(() => {
  switch (step.value?.key) {
    case 'transfers': return transferItems.value.every((t) => isDone('tf:' + t.accountId))
    case 'fixed': return fixedGroups.value.every((g) => g.items.every((l) => isDone('fx:' + l.id)))
    case 'variable': return variableGroups.value.every((g) => g.items.every((l) => isDone('vr:' + l.id)))
    case 'mf': return mfItems.value.every((f) => isDone('mf:' + f.dkey))
    case 'stocks': return stockItems.value.every((f) => isDone('st:' + f.dkey))
    case 'checklist': return (working.value?.checklist ?? []).every((c) => checkItemDone(c))
    default: return true
  }
})

// ── Progress ring (cumulative across the whole ritual) ────────────────────────
const allActionKeys = computed(() => {
  const k = []
  for (const t of transferItems.value) k.push('tf:' + t.accountId)
  for (const g of fixedGroups.value) for (const l of g.items) k.push('fx:' + l.id)
  for (const g of variableGroups.value) for (const l of g.items) k.push('vr:' + l.id)
  for (const f of mfItems.value) k.push('mf:' + f.dkey)
  for (const f of stockItems.value) k.push('st:' + f.dkey)
  for (const c of working.value?.checklist ?? []) if (!c.isAuto) k.push('ck:' + c.id)
  return k
})
const totalActions = computed(() => allActionKeys.value.length)
const completedActions = computed(() => allActionKeys.value.filter((k) => isDone(k)).length)
const progress = computed(() => (totalActions.value ? completedActions.value / totalActions.value : 1))
const RING = 2 * Math.PI * 15.5

const displayPct = ref(0)
function tweenPct(to) {
  if (typeof requestAnimationFrame !== 'function') { displayPct.value = to * 100; return }
  cancelAnimationFrame(rafId)
  const from = displayPct.value
  const target = to * 100
  const t0 = performance.now()
  const tick = (now) => {
    const t = Math.min(1, (now - t0) / 600)
    displayPct.value = from + (target - from) * (1 - Math.pow(1 - t, 3))
    if (t < 1) rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}
watch(progress, (v) => tweenPct(v))

// ── Intro + milestone + finale summaries ──────────────────────────────────────
const toMove = computed(() => transferItems.value.reduce((s, t) => s + t.amount, 0))
// "Invested" stat is counted-only (parked direct money is moved but tracked as saving).
const investedTotal = computed(() => [...mfItems.value, ...stockItems.value].reduce((s, f) => s + (f.investAmount ?? f.amount), 0))

const stepSummary = computed(() => {
  switch (step.value?.key) {
    case 'transfers': return { title: 'Money moved!', detail: `${fmt(toMove.value)} across ${transferItems.value.length} account${transferItems.value.length > 1 ? 's' : ''}` }
    case 'fixed': { const t = fixedGroups.value.reduce((s, g) => s + g.total, 0); return { title: 'Fixed expenses paid', detail: fmt(t) } }
    case 'variable': { const t = variableGroups.value.reduce((s, g) => s + g.total, 0); return { title: 'Variable expenses paid', detail: fmt(t) } }
    case 'mf': { const t = mfItems.value.reduce((s, f) => s + f.amount, 0); return { title: 'Mutual funds funded', detail: `${fmt(t)} into ${mfItems.value.length} fund${mfItems.value.length > 1 ? 's' : ''}` } }
    case 'stocks': { const t = stockItems.value.reduce((s, f) => s + f.amount, 0); return { title: 'Stocks bought', detail: `${fmt(t)} into ${stockItems.value.length} holding${stockItems.value.length > 1 ? 's' : ''}` } }
    case 'checklist': return { title: 'All checked off', detail: 'Nothing left to do' }
    default: return { title: 'Done', detail: '' }
  }
})

// ── Lifecycle ────────────────────────────────────────────────────────────────
watch(() => props.open, (o) => {
  if (o) { reset(); window.addEventListener('keydown', onKey); nextTick(() => rootEl.value?.focus()) }
  else { window.removeEventListener('keydown', onKey); cancelAnimationFrame(rafId); clearTimeout(advanceTimer) }
})
function reset() {
  clearTimeout(advanceTimer)
  cancelAnimationFrame(rafId)
  working.value = JSON.parse(JSON.stringify(props.month ?? {}))
  current.value = 0
  dir.value = 1
  started.value = false
  milestone.value = false
  celebrating.value = false
  confetti.value = []
  const d = new Set()
  for (const t of transferItems.value) if (checklistDoneFor(t.accountId)) d.add('tf:' + t.accountId)
  if (checklistDoneFor('inv:mf')) for (const f of mfItems.value) d.add('mf:' + f.dkey)
  if (checklistDoneFor('inv:stocks')) for (const f of stockItems.value) d.add('st:' + f.dkey)
  for (const c of working.value.checklist ?? []) if (!c.isAuto && c.isDone) d.add('ck:' + c.id)
  doneSet.value = d
  displayPct.value = progress.value * 100
}

function begin() { dir.value = 1; started.value = true }

// Completing the LAST item of a scene → play its milestone, then glide on. Driven
// by the toggle handlers (not a watch) so Back/Continue never auto-bounces.
function scheduleAdvanceIfComplete() {
  clearTimeout(advanceTimer)
  if (!stepComplete.value || !props.open || celebrating.value || !started.value) return
  milestone.value = true
  advanceTimer = setTimeout(() => { milestone.value = false; if (stepComplete.value && props.open && !celebrating.value) next() }, 1700)
}
function next() {
  clearTimeout(advanceTimer)
  milestone.value = false
  if (isLast.value) return finish()
  dir.value = 1
  current.value++
}
function back() {
  clearTimeout(advanceTimer)
  milestone.value = false
  if (current.value > 0) { dir.value = -1; current.value-- }
}

function finish() {
  const list = (working.value?.checklist ?? []).map((c) => ({ ...c, isDone: checkItemDone(c) }))
  emit('complete', list)
  celebrating.value = true
  nextTick(makeConfetti)
}

const COLORS = ['var(--invest)', 'var(--positive)', 'var(--auto)', 'var(--negative)', 'var(--primary)']
function makeConfetti() {
  confetti.value = Array.from({ length: 110 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    dx: `${Math.round(Math.random() * 40 - 20)}vw`,
    rot: `${Math.round(360 + Math.random() * 900)}deg`,
    dur: `${(2 + Math.random() * 1.8).toFixed(2)}s`,
    delay: `${(Math.random() * 0.5).toFixed(2)}s`,
    color: COLORS[i % COLORS.length],
    size: Math.round(6 + Math.random() * 10),
    round: Math.random() > 0.5,
  }))
}

function close() { clearTimeout(advanceTimer); cancelAnimationFrame(rafId); emit('update:open', false) }
function onKey(e) { if (e.key === 'Escape' && !celebrating.value) close() }
onBeforeUnmount(() => { clearTimeout(advanceTimer); cancelAnimationFrame(rafId); window.removeEventListener('keydown', onKey) })
</script>

<template>
  <Teleport to="body">
    <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0" leave-active-class="transition duration-200" leave-to-class="opacity-0">
      <div v-if="open" ref="rootEl" class="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-background outline-none" role="dialog" aria-modal="true" aria-label="Start month" tabindex="-1">
        <!-- ambient accent glow -->
        <div class="scene-glow pointer-events-none absolute inset-0" :style="{ background: `radial-gradient(70% 55% at 50% -5%, ${tint(celebrating ? 'var(--positive)' : started ? stepAccent : 'var(--primary)', 16)}, transparent 70%)` }" />

        <!-- ░░░ FINALE ░░░ -->
        <div v-if="celebrating" class="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-6 text-center">
          <div class="pointer-events-none absolute inset-0 overflow-hidden">
            <span v-for="c in confetti" :key="c.id" class="confetti-piece" :style="{ left: c.left + '%', width: c.size + 'px', height: c.size + 'px', background: c.color, borderRadius: c.round ? '9999px' : '2px', '--dx': c.dx, '--rot': c.rot, '--dur': c.dur, '--delay': c.delay }" />
          </div>
          <div class="relative grid size-28 animate-in zoom-in-50 place-items-center rounded-full bg-positive/15 text-positive duration-500">
            <PartyPopperIcon class="size-14" />
          </div>
          <div class="relative animate-in fade-in slide-in-from-bottom-3 duration-500">
            <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">{{ monthLabel }} is underway! 🎉</h2>
            <p class="mt-2 text-muted-foreground">You handled every transfer, payment and investment.</p>
          </div>
          <div class="relative flex flex-wrap items-center justify-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div v-if="toMove" class="rounded-2xl border bg-card/60 px-4 py-3 backdrop-blur">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Moved</p>
              <p class="text-lg font-bold">{{ fmt(toMove) }}</p>
            </div>
            <div v-if="investedTotal" class="rounded-2xl border bg-card/60 px-4 py-3 backdrop-blur">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Invested</p>
              <p class="text-lg font-bold text-positive">{{ fmt(investedTotal) }}</p>
            </div>
            <div class="rounded-2xl border bg-card/60 px-4 py-3 backdrop-blur">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Tasks done</p>
              <p class="text-lg font-bold">{{ totalActions }}</p>
            </div>
          </div>
          <UiButton size="lg" class="relative mt-2 animate-in fade-in duration-1000" @click="close"><CheckIcon class="size-4" /> Back to {{ monthLabel }}</UiButton>
        </div>

        <!-- ░░░ INTRO ░░░ -->
        <div v-else-if="!started" class="relative flex flex-1 flex-col items-center justify-center gap-7 px-6 text-center">
          <UiButton variant="ghost" size="icon" class="absolute right-4 top-4 size-9" aria-label="Close" @click="close"><XIcon class="size-5" /></UiButton>
          <div class="grid size-20 animate-in zoom-in-75 place-items-center rounded-3xl bg-primary/12 text-primary duration-500"><SparklesIcon class="size-10" /></div>
          <div class="animate-in fade-in slide-in-from-bottom-3 duration-500">
            <p class="text-sm font-medium uppercase tracking-widest text-muted-foreground">Start of</p>
            <h2 class="text-4xl font-bold tracking-tight sm:text-5xl">{{ monthLabel }}</h2>
            <p class="mx-auto mt-3 max-w-md text-muted-foreground">A quick guided run-through to put this month's money to work — one satisfying step at a time.</p>
          </div>
          <div class="flex flex-wrap items-center justify-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div v-if="toMove" class="rounded-2xl border bg-card/60 px-4 py-3 text-left backdrop-blur">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">To move</p><p class="text-lg font-bold">{{ fmt(toMove) }}</p>
            </div>
            <div v-if="investedTotal" class="rounded-2xl border bg-card/60 px-4 py-3 text-left backdrop-blur">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">To invest</p><p class="text-lg font-bold text-positive">{{ fmt(investedTotal) }}</p>
            </div>
            <div class="rounded-2xl border bg-card/60 px-4 py-3 text-left backdrop-blur">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Steps</p><p class="text-lg font-bold">{{ steps.length }}</p>
            </div>
          </div>
          <UiButton size="lg" class="mt-2 animate-in fade-in zoom-in-95 duration-1000" @click="begin"><RocketIcon class="size-4" /> Begin</UiButton>
        </div>

        <!-- ░░░ SCENES ░░░ -->
        <template v-else>
          <header class="relative z-10 shrink-0 border-b bg-card/40 px-4 py-3 backdrop-blur md:px-6">
            <div class="mx-auto flex max-w-2xl items-center gap-4">
              <div class="relative grid size-14 shrink-0 place-items-center">
                <svg viewBox="0 0 36 36" class="size-14 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--muted)" stroke-width="3" />
                  <circle cx="18" cy="18" r="15.5" fill="none" :stroke="stepAccent" stroke-width="3" stroke-linecap="round" :stroke-dasharray="RING" :stroke-dashoffset="RING * (1 - progress)" class="transition-[stroke-dashoffset] duration-700 ease-out" />
                </svg>
                <span class="absolute text-xs font-bold tabular-nums">{{ Math.round(displayPct) }}%</span>
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold">{{ monthLabel }}</p>
                <p class="text-xs text-muted-foreground">{{ completedActions }} of {{ totalActions }} done · step {{ current + 1 }}/{{ steps.length }}</p>
              </div>
              <div class="hidden items-center gap-1.5 sm:flex">
                <span v-for="(s, i) in steps" :key="s.key" class="size-2 rounded-full transition-all duration-500" :style="{ background: i < current ? 'var(--positive)' : i === current ? stepAccent : 'var(--muted)' }" :class="i === current && 'w-5'" />
              </div>
              <UiButton variant="ghost" size="icon" class="size-8 shrink-0" aria-label="Close" @click="close"><XIcon class="size-4" /></UiButton>
            </div>
          </header>

          <div class="relative flex-1 overflow-y-auto px-4 py-6 md:px-6">
            <Transition
              mode="out-in"
              enter-active-class="transition duration-300 ease-out"
              :enter-from-class="dir > 0 ? 'opacity-0 translate-x-8' : 'opacity-0 -translate-x-8'"
              leave-active-class="transition duration-150 ease-in"
              :leave-to-class="dir > 0 ? 'opacity-0 -translate-x-8' : 'opacity-0 translate-x-8'"
            >
              <div :key="step?.key" class="mx-auto max-w-2xl space-y-5">
                <div class="flex items-start gap-3">
                  <span class="grid size-12 shrink-0 place-items-center rounded-2xl" :style="{ background: tint(stepAccent, 14), color: stepAccent }"><component :is="step?.icon" class="size-6" /></span>
                  <div>
                    <h2 class="text-2xl font-bold tracking-tight">{{ step?.title }}</h2>
                    <p class="text-sm text-muted-foreground">{{ step?.subtitle }}</p>
                  </div>
                </div>

                <!-- TRANSFERS -->
                <ul v-if="step?.key === 'transfers'" class="space-y-3">
                  <li v-for="t in transferItems" :key="t.accountId">
                    <button type="button" class="group flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all duration-200 hover:border-foreground/25" :class="!isDone('tf:' + t.accountId) && 'border-border'" :style="isDone('tf:' + t.accountId) ? { borderColor: stepAccent, background: tint(stepAccent, 8) } : {}" @click="toggle('tf:' + t.accountId)">
                      <span class="grid size-11 shrink-0 place-items-center rounded-xl" :style="{ background: tint(stepAccent, 14), color: stepAccent }"><LandmarkIcon class="size-5" /></span>
                      <span class="min-w-0 flex-1">
                        <span class="block text-xs uppercase tracking-wide text-muted-foreground">Transfer to</span>
                        <span class="block truncate text-base font-semibold">{{ t.name }}</span>
                      </span>
                      <MoneyValue :amount="t.amount" :currency="currency" variant="total" class="shrink-0 text-lg font-bold" />
                      <StepCheck :done="isDone('tf:' + t.accountId)" :accent="stepAccent" />
                    </button>
                  </li>
                </ul>

                <!-- FIXED / VARIABLE -->
                <div v-else-if="step?.key === 'fixed' || step?.key === 'variable'" class="space-y-4">
                  <div v-for="g in (step.key === 'fixed' ? fixedGroups : variableGroups)" :key="g.accountId" class="overflow-hidden rounded-2xl border">
                    <div class="flex items-center justify-between gap-2 bg-muted/40 px-4 py-2.5">
                      <span class="flex items-center gap-2 text-sm font-semibold"><LandmarkIcon class="size-4 text-muted-foreground" /> Pay from {{ g.name }}<UiBadge v-if="g.isIncome" variant="outline" class="text-[10px]">income</UiBadge></span>
                      <MoneyValue :amount="g.total" :currency="currency" variant="muted" class="text-sm" />
                    </div>
                    <ul class="divide-y">
                      <li v-for="l in g.items" :key="l.id">
                        <button type="button" class="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors" :style="isDone((step.key === 'fixed' ? 'fx:' : 'vr:') + l.id) ? { background: tint(stepAccent, 8) } : {}" @click="toggle((step.key === 'fixed' ? 'fx:' : 'vr:') + l.id)">
                          <span class="min-w-0 flex-1 truncate text-sm font-medium" :class="isDone((step.key === 'fixed' ? 'fx:' : 'vr:') + l.id) && 'text-muted-foreground line-through'">{{ l.item || 'Expense' }}</span>
                          <MoneyValue :amount="l.amount" :currency="currency" variant="total" class="shrink-0 font-semibold" />
                          <StepCheck :done="isDone((step.key === 'fixed' ? 'fx:' : 'vr:') + l.id)" :accent="stepAccent" small />
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>

                <!-- MUTUAL FUNDS / STOCKS -->
                <ul v-else-if="step?.key === 'mf' || step?.key === 'stocks'" class="space-y-3">
                  <li v-for="f in (step.key === 'mf' ? mfItems : stockItems)" :key="(step.key === 'mf' ? 'mf:' : 'st:') + f.dkey">
                    <button type="button" class="group flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all duration-200 hover:border-foreground/25" :class="!isDone((step.key === 'mf' ? 'mf:' : 'st:') + f.dkey) && 'border-border'" :style="isDone((step.key === 'mf' ? 'mf:' : 'st:') + f.dkey) ? { borderColor: stepAccent, background: tint(stepAccent, 8) } : {}" @click="toggle((step.key === 'mf' ? 'mf:' : 'st:') + f.dkey)">
                      <span class="grid size-11 shrink-0 place-items-center rounded-xl" :style="{ background: tint(stepAccent, 14), color: stepAccent }"><CoinsIcon class="size-5" /></span>
                      <span class="min-w-0 flex-1">
                        <span class="flex items-center gap-1.5">
                          <span class="truncate text-base font-semibold">{{ f.name }}</span>
                          <span v-if="f.parked || f.partParked" class="shrink-0 rounded-full border border-positive/40 bg-positive/10 px-1.5 py-0.5 text-[10px] font-medium text-positive">{{ f.partParked ? 'Part parked' : 'Parked' }}</span>
                        </span>
                        <span v-if="f.bucket" class="block truncate text-xs text-muted-foreground">{{ f.bucket }}</span>
                      </span>
                      <MoneyValue :amount="f.amount" :currency="currency" variant="total" class="shrink-0 text-lg font-bold" />
                      <StepCheck :done="isDone((step.key === 'mf' ? 'mf:' : 'st:') + f.dkey)" :accent="stepAccent" />
                    </button>
                  </li>
                </ul>

                <!-- FINAL CHECKLIST -->
                <ul v-else-if="step?.key === 'checklist'" class="space-y-3">
                  <li v-for="c in (working?.checklist ?? [])" :key="c.id">
                    <button type="button" class="flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all duration-200 hover:border-foreground/25" :class="!checkItemDone(c) && 'border-border'" :style="checkItemDone(c) ? { borderColor: stepAccent, background: tint(stepAccent, 8) } : {}" @click="toggleCheckItem(c)">
                      <span class="min-w-0 flex-1 text-sm font-medium" :class="checkItemDone(c) && 'text-muted-foreground line-through'">{{ c.label }}</span>
                      <StepCheck :done="checkItemDone(c)" :accent="stepAccent" small />
                    </button>
                  </li>
                  <li v-if="!(working?.checklist ?? []).length" class="rounded-2xl border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">Nothing on the checklist — you're all set.</li>
                </ul>
              </div>
            </Transition>

            <!-- per-step milestone celebration -->
            <Transition enter-active-class="transition duration-300" enter-from-class="opacity-0" leave-active-class="transition duration-200" leave-to-class="opacity-0">
              <div v-if="milestone" class="absolute inset-0 z-20 grid place-items-center bg-background/85 backdrop-blur-sm">
                <div class="flex flex-col items-center gap-5 px-6 text-center">
                  <div class="grid size-28 animate-in zoom-in-50 place-items-center rounded-full duration-500" :style="{ background: tint(stepAccent, 16), color: stepAccent }">
                    <CheckIcon class="size-16" />
                  </div>
                  <div class="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <p class="text-2xl font-bold tracking-tight">{{ stepSummary.title }}</p>
                    <p class="mt-1 text-muted-foreground">{{ stepSummary.detail }}</p>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <footer class="relative z-10 shrink-0 border-t bg-card/40 px-4 py-3 backdrop-blur md:px-6">
            <div class="mx-auto flex max-w-2xl items-center gap-3">
              <UiButton v-if="current > 0 && !milestone" variant="ghost" size="sm" @click="back"><ArrowLeftIcon class="size-4" /> Back</UiButton>
              <UiButton v-if="stepComplete && !milestone" class="ml-auto" :style="{ background: stepAccent }" @click="next">
                <template v-if="isLast"><RocketIcon class="size-4" /> Finish</template>
                <template v-else>Continue <ArrowRightIcon class="size-4" /></template>
              </UiButton>
              <button v-else-if="!milestone" type="button" class="ml-auto text-sm text-muted-foreground underline-offset-4 hover:underline" @click="next">Skip for now</button>
            </div>
          </footer>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>
