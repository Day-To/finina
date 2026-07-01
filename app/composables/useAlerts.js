// Reminders/Alerts — app-wide singleton (mirrors useChat.js/useBankAccounts.js).
// Owns: live alerts subscription, the ONE reactive clock, the idempotent firing
// loop (delegates exactly-once to alertsRepo.fireAdvance), permission UX, and the
// badge/grouping computeds. NO onScopeDispose (singleton); restarts on uid change.
import { ref, computed } from 'vue'
import { toast } from 'vue-sonner'
import { alertsRepo } from '~/repositories/alerts.js'
import { storageRepo } from '~/repositories/storage.js' // ROUND-4: composable owns the Storage passthrough so components never import a repo
import { describeRecurrence } from '~/domain/calc/recurrence.js'

const TICK_MS = 20_000        // ≤20s lateness — fine for human reminders
const alerts = ref([])
const loading = ref(true)
const now = ref(Date.now())
const centerOpen = ref(false) // notification-center sheet open state (chrome)

let initialized = false
let unsub = null
let timer = null
let permissionAsked = false
const inFlight = new Set()    // alertIds with a fireAdvance in progress (this tab)

const tsMs = (ts) => ts?.toDate?.().getTime() ?? (ts instanceof Date ? ts.getTime() : (typeof ts === 'number' ? ts : 0))

function startClock() {
  if (timer || typeof window === 'undefined') return
  timer = setInterval(() => { now.value = Date.now() }, TICK_MS)
  document.addEventListener('visibilitychange', onVisible) // snappy app-reopen
}
function onVisible() { if (document.visibilityState === 'visible') { now.value = Date.now(); processDue() } }

function start(uid) {
  if (unsub) { unsub(); unsub = null }
  if (!uid) { alerts.value = []; loading.value = false; return }
  loading.value = true
  unsub = alertsRepo.subscribe(uid, (list) => {
    alerts.value = list
    loading.value = false
    processDue() // a freshly-arrived/already-due alert fires without waiting a tick
  }, (e) => { console.error('[finina] alerts subscription error', e); loading.value = false })
}

function init() {
  if (initialized) return
  initialized = true
  startClock()
  const auth = useAuthStore()
  watch(() => auth.user?.uid, (uid) => start(uid), { immediate: true })
  watch(now, processDue)
}

/** The firing loop. Dispatch is gated by fireAdvance's transaction (B2): only a
 *  {fired:true} result notifies, so multiple tabs → exactly one toast + Notification. */
async function processDue() {
  const auth = useAuthStore()
  const uid = auth.user?.uid
  if (!uid) return
  const t = now.value
  for (const a of alerts.value) {
    if (a.archived || a.enabled === false || a.status !== 'active') continue
    if (a.nextFireAt == null || a.nextFireAt > t) continue
    if (inFlight.has(a.id)) continue
    inFlight.add(a.id)
    try {
      const res = await alertsRepo.fireAdvance(uid, a, Date.now())
      if (res?.fired) notify(a)
    } catch (e) { console.error('[finina] fireAdvance error', e) }
    finally { inFlight.delete(a.id) }
  }
}

function notify(alert) {
  // (1) In-app toast — ALWAYS (this is the only channel guaranteed everywhere).
  toast(alert.title, {
    description: alert.description || describeRecurrence(alert.recurrence),
    action: { label: 'View', onClick: () => navigateTo(`/alerts/${alert.id}`) },
  })
  // (2) OS Notification — only when granted, and WRAPPED IN try/catch: on iOS
  // Safari/installed PWA the constructor throws "Illegal constructor" even when
  // Notification exists, and Chrome-for-Android requires showNotification(); we
  // degrade silently to the toast. `tag` coalesces repeat OS notifications for the
  // SAME alert — it does NOT affect toasts (that's why the tx gate, not tag,
  // prevents duplicate toasts across tabs).
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(alert.title, {
        body: alert.description || describeRecurrence(alert.recurrence),
        tag: alert.id,
      })
      n.onclick = () => { try { window.focus() } catch {} ; navigateTo(`/alerts/${alert.id}`) }
    }
  } catch { /* iOS / Chrome-Android construct throw → toast already shown */ }
}

/** Request Notification permission with a pre-prompt — called on FIRST reminder
 *  creation only (never on app load). Returns the resulting permission string. */
async function requestPermission() {
  permissionAsked = true
  try {
    if (typeof Notification === 'undefined') return 'unsupported'
    if (Notification.permission !== 'default') return Notification.permission
    return await Notification.requestPermission()
  } catch { return 'unsupported' }
}

export function useAlerts() {
  init()
  const auth = useAuthStore()
  const uid = () => { const u = auth.user?.uid; if (!u) throw new Error('Not signed in'); return u }

  const visible = computed(() => alerts.value.filter((a) => !a.archived))
  const active = computed(() => visible.value.filter((a) => a.status === 'active' && a.enabled !== false))
  const startOfTomorrow = computed(() => { const d = new Date(now.value); d.setHours(24, 0, 0, 0); return d.getTime() })

  const overdue = computed(() => active.value.filter((a) => a.nextFireAt != null && a.nextFireAt <= now.value)
    .sort((x, y) => x.nextFireAt - y.nextFireAt))
  const dueToday = computed(() => active.value.filter((a) => a.nextFireAt != null && a.nextFireAt > now.value && a.nextFireAt < startOfTomorrow.value))
  const upcoming = computed(() => active.value.filter((a) => a.nextFireAt != null && a.nextFireAt >= startOfTomorrow.value))
  const completed = computed(() => visible.value.filter((a) => a.status === 'completed'))
  const disabled = computed(() => visible.value.filter((a) => a.enabled === false && a.status === 'active'))
  // ROUND-5: completed alerts that fired since last opened have no nextFireAt, so they
  // appear in NO active group — surface them in the center so the badge (which counts
  // them) is always actionable (else: badge shows N but center says "nothing due").
  const recentlyFired = computed(() => visible.value
    .filter((a) => a.status === 'completed' && a.lastFiredAt && tsMs(a.lastFiredAt) > tsMs(a.readAt))
    .sort((x, y) => tsMs(y.lastFiredAt) - tsMs(x.lastFiredAt)))

  // Reminders needing attention right now = ringing (active & due) OR fired-but-unread.
  // This single set drives the nav badge AND the main-screen alert banner (kept in sync).
  // Most-urgent first (overdue by soonest nextFireAt, then completed-unread).
  const attention = computed(() => visible.value.filter((a) => {
    const ringing = a.status === 'active' && a.enabled !== false && a.nextFireAt != null && a.nextFireAt <= now.value
    // enabled gate (ROUND-5): a disabled alert never contributes to the badge/banner.
    const firedUnread = a.enabled !== false && a.lastFiredAt && tsMs(a.lastFiredAt) > tsMs(a.readAt)
    return ringing || firedUnread
  }).sort((x, y) => {
    const xt = x.status === 'completed' ? Infinity : (x.nextFireAt ?? Infinity)
    const yt = y.status === 'completed' ? Infinity : (y.nextFireAt ?? Infinity)
    return xt - yt
  }))
  const unreadCount = computed(() => attention.value.length)

  return {
    alerts, loading, now, centerOpen,
    overdue, dueToday, upcoming, completed, disabled, recentlyFired, attention, unreadCount,
    requestPermission, permissionAsked: () => permissionAsked,
    newId: () => alertsRepo.newId(),
    // ROUND-4: Storage passthroughs (components go through the composable, never the repo).
    uploadAttachment: (alertId, file, onProgress) => storageRepo.uploadAttachment(uid(), alertId, file, onProgress),
    deleteAttachment: (path) => storageRepo.deleteAttachment(path),
    get: (id) => alertsRepo.get(uid(), id),
    create: (input, presetId) => alertsRepo.create(uid(), input, presetId),
    update: (id, patch) => alertsRepo.update(uid(), id, patch),
    reschedule: (id, p) => alertsRepo.reschedule(uid(), id, p),
    snooze: (id, untilMs) => alertsRepo.snooze(uid(), id, untilMs),
    complete: (id) => alertsRepo.complete(uid(), id),
    reopen: (id) => alertsRepo.reopen(uid(), id),
    setEnabled: (id, v) => alertsRepo.setEnabled(uid(), id, v),
    markRead: (id) => alertsRepo.markRead(uid(), id),
    archive: (id) => alertsRepo.archive(uid(), id),
    restore: (id) => alertsRepo.restore(uid(), id),
    purge: (id) => alertsRepo.purge(uid(), id),
  }
}
