// AI copilot chat — app-wide singleton (mirrors useSettings.js). Owns the open
// state, the current thread + its live messages, and the send() flow:
// persist the user message → POST /api/ai/chat with a fresh ID token → stream the
// SSE reply into `streamingText` → persist the assistant message on completion.
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { chatRepo } from '~/repositories/chat.js'

const HISTORY_LIMIT = 20

const isOpen = ref(false)
const threadId = ref(null)
const threads = ref([])
const messages = ref([])
const isStreaming = ref(false)
const streamingText = ref('')
const statusLabel = ref('')
const error = ref(null)

let initialized = false
let unsub = null
let threadsUnsub = null
let lastPayload = null
let lastTid = null

function stop() { if (unsub) { unsub(); unsub = null } }

function subscribe(uid, tid) {
  stop()
  unsub = chatRepo.subscribeMessages(uid, tid, (list) => { messages.value = list }, (e) => {
    console.error('[finina] chat subscription error', e)
  })
}

function resetForUid() {
  stop()
  threadId.value = null
  messages.value = []
  streamingText.value = ''
  statusLabel.value = ''
  isStreaming.value = false
  error.value = null
}

function init() {
  if (initialized) return
  initialized = true
  const auth = useAuthStore()
  // App-wide singleton; restart on uid change.
  watch(() => auth.user?.uid, (uid) => {
    resetForUid()
    if (threadsUnsub) { threadsUnsub(); threadsUnsub = null }
    threads.value = []
    if (uid) {
      threadsUnsub = chatRepo.subscribeThreads(uid, (list) => { threads.value = list }, (e) => {
        console.error('[finina] chat threads error', e)
      })
    }
  }, { immediate: true })
}

async function getIdToken(force = false) {
  const { $firebaseAuth } = useNuxtApp()
  const user = $firebaseAuth?.currentUser
  if (!user) throw new Error('Not signed in')
  return user.getIdToken(force)
}

function nextSeq() {
  return messages.value.reduce((mx, m) => Math.max(mx, m.seq || 0), 0) + 1
}

/** Read the SSE stream, appending tokens to streamingText. Resolves on `done`. */
async function readStream(token, payloadMessages) {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ threadId: threadId.value, messages: payloadMessages }),
  })
  if (res.status === 401) { const e = new Error('unauthorized'); e.code = 401; throw e }
  if (res.status === 429) { const e = new Error('rate_limited'); e.code = 429; throw e }
  if (!res.ok || !res.body) {
    let msg = 'Copilot is unavailable right now.'
    try { msg = (await res.json())?.error || msg } catch { /* ignore */ }
    throw new Error(msg)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
    let idx
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n')
      if (!data) continue
      let evt
      try { evt = JSON.parse(data) } catch { continue }
      if (evt.type === 'token') { streamingText.value += evt.text || ''; statusLabel.value = '' }
      else if (evt.type === 'status') { statusLabel.value = evt.label || '' }
      else if (evt.type === 'error') { throw new Error(evt.message || 'Copilot error') }
      else if (evt.type === 'done') { return }
    }
  }
}

/**
 * Stream one turn for an already-persisted `payload` (its trailing user message
 * is assumed persisted) and persist the assistant reply. `explicitAssistantSeq`
 * reserves the assistant's order on first send (avoids a snapshot race); pass
 * null on retry to append after whatever is now persisted.
 */
async function performStream(uid, tid, payload, explicitAssistantSeq) {
  error.value = null
  isStreaming.value = true
  streamingText.value = ''
  statusLabel.value = ''
  try {
    let token = await getIdToken(false)
    try { await readStream(token, payload) }
    catch (e) {
      if (e.code === 401) { token = await getIdToken(true); await readStream(token, payload) }
      else throw e
    }
    const answer = streamingText.value.trim()
    if (answer) await chatRepo.addMessage(uid, tid, { role: 'assistant', content: answer, seq: explicitAssistantSeq ?? nextSeq(), status: 'complete' })
  }
  catch (e) {
    if (e.code === 429) {
      toast.warning('You\'re sending messages too fast. Please wait a moment.')
    }
    else {
      console.error('[finina] copilot send error', e)
      error.value = e.message || 'Something went wrong.'
      // Persist any partial answer so a dropped stream doesn't orphan the question.
      const partial = streamingText.value.trim()
      if (partial && tid) {
        try { await chatRepo.addMessage(uid, tid, { role: 'assistant', content: partial, seq: explicitAssistantSeq ?? nextSeq(), status: 'error' }) }
        catch { /* best-effort */ }
      }
      toast.error('Copilot couldn\'t answer. Please try again.')
    }
  }
  finally {
    streamingText.value = ''
    statusLabel.value = ''
    isStreaming.value = false
  }
}

export function useChat() {
  init()
  const auth = useAuthStore()

  async function open() {
    isOpen.value = true
    const uid = auth.user?.uid
    if (uid && !threadId.value) {
      try {
        const tid = await chatRepo.latestThreadId(uid)
        if (tid) { threadId.value = tid; subscribe(uid, tid) }
      }
      catch (e) { console.error('[finina] open chat error', e) }
    }
  }
  function close() { isOpen.value = false }
  function toggle() { isOpen.value ? close() : open() }

  async function newThread() {
    const uid = auth.user?.uid
    if (!uid || isStreaming.value) return
    stop()
    messages.value = []
    streamingText.value = ''
    error.value = null
    threadId.value = await chatRepo.createThread(uid, 'New chat')
    subscribe(uid, threadId.value)
  }

  // Switch to an existing thread and resume it from where it left off.
  function openThread(tid) {
    const uid = auth.user?.uid
    if (!uid || !tid || isStreaming.value || tid === threadId.value) return
    streamingText.value = ''
    statusLabel.value = ''
    error.value = null
    threadId.value = tid
    subscribe(uid, tid)
  }

  // Permanently delete a thread (+ its messages). If it was the active thread,
  // fall back to the next most-recent one (or an empty state if none remain).
  async function deleteThread(tid) {
    const uid = auth.user?.uid
    if (!uid || !tid || isStreaming.value) return
    await chatRepo.deleteThread(uid, tid)
    if (tid === threadId.value) {
      stop()
      threadId.value = null
      messages.value = []
      streamingText.value = ''
      statusLabel.value = ''
      error.value = null
      const next = await chatRepo.latestThreadId(uid)
      if (next) { threadId.value = next; subscribe(uid, next) }
    }
  }

  async function ensureThread(uid, firstText) {
    if (threadId.value) return threadId.value
    const existing = await chatRepo.latestThreadId(uid)
    const tid = existing || await chatRepo.createThread(uid, firstText || 'New chat')
    threadId.value = tid
    subscribe(uid, tid)
    return tid
  }

  async function send(text) {
    const content = String(text || '').trim()
    const uid = auth.user?.uid
    if (!content || !uid || isStreaming.value) return

    const tid = await ensureThread(uid, content)
    const base = nextSeq()
    // Capture history BEFORE persisting the new turn so we don't double-send it.
    const history = messages.value.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content }))
    const isFirst = messages.value.length === 0
    await chatRepo.addMessage(uid, tid, { role: 'user', content, seq: base })
    await chatRepo.touchThread(uid, tid, isFirst ? { title: content.slice(0, 60) } : {})

    const payload = [...history, { role: 'user', content }]
    lastPayload = payload
    lastTid = tid
    // Reserve base+1 for the assistant so the pair never flips before snapshot.
    await performStream(uid, tid, payload, base + 1)
  }

  // Re-run the last turn (its user message is already persisted) — append a fresh
  // assistant reply after whatever exists; never duplicate the user message.
  async function retry() {
    const uid = auth.user?.uid
    if (!uid || !lastPayload || !lastTid || isStreaming.value) return
    await performStream(uid, lastTid, lastPayload, null)
  }

  return {
    isOpen, threadId, threads, messages, isStreaming, streamingText, statusLabel, error,
    open, close, toggle, newThread, openThread, deleteThread, send, retry,
  }
}
