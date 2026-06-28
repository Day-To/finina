// POST /api/ai/chat — the Finina AI copilot endpoint.
//
// Security/abuse posture:
//  - uid comes ONLY from a verified Firebase ID token (Authorization: Bearer …),
//    never from the body. Reads are Admin-SDK scoped to users/{uid}/…
//  - per-uid quota (429) + byte/length/count caps on the body.
//  - the system prompt is built SERVER-SIDE; client-supplied system/tool/function
//    items are never forwarded — only the {user,assistant} text turns.
//  - read-only: no tool mutates anything.
// Streams the answer over SSE (token/status/done/error events) with a heartbeat
// and aborts the upstream OpenAI call if the client disconnects.
import { adminAuth } from '../../utils/firebaseAdmin.js'
import { assertWithinQuota } from '../../utils/copilotQuota.js'
import { runCopilot } from '../../utils/openai.js'
import { loadSettings, loadMonthsList, serverToday, serverCurrentMonth } from '../../utils/copilotData.js'
import { buildSystemPrompt } from '#domain/copilot/prompt.js'

const MAX_MSGS = Number(process.env.COPILOT_MAX_MSGS || 20)
const MAX_CONTENT = Number(process.env.COPILOT_CONTENT_MAX || 8000)
const MAX_BYTES = Number(process.env.COPILOT_MAX_BYTES || 65536)

export default defineEventHandler(async (event) => {
  // 1) Auth — uid from the verified ID token only.
  let uid
  try {
    const token = (getHeader(event, 'authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) { setResponseStatus(event, 401); return { ok: false, error: 'Unauthorized' } }
    uid = (await adminAuth().verifyIdToken(token)).uid
  }
  catch (err) {
    const msg = String(err?.message || err)
    console.error('[copilot] auth failed:', msg)
    // Missing/invalid Admin credentials (or a project mismatch) is a SERVER config
    // problem, not a bad token — surface it distinctly so it's debuggable.
    if (/credential|GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_(SERVICE_ACCOUNT|PROJECT_ID|CLIENT_EMAIL|PRIVATE_KEY)|service account|Failed to (parse|determine)|Getting metadata|app\/invalid-credential/i.test(msg)) {
      setResponseStatus(event, 503)
      return { ok: false, error: 'Copilot isn\'t configured on the server yet (Firebase Admin credentials missing or invalid).' }
    }
    setResponseStatus(event, 401)
    return { ok: false, error: 'Unauthorized' }
  }

  // 2) Quota (429).
  try {
    await assertWithinQuota(uid)
  }
  catch (err) {
    setResponseStatus(event, err?.statusCode || 429)
    return { ok: false, error: err?.message || 'Rate limited' }
  }

  // 3) Body + sanitize — never trust roles/content beyond {user,assistant} text.
  let body = await readBody(event)
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = null } }
  const rawMessages = Array.isArray(body?.messages) ? body.messages : []
  const messages = rawMessages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_MSGS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT) }))
  // Keep the WHOLE recent conversation for context, but trim the OLDEST turns if
  // it exceeds the byte budget — never reject a long chat outright.
  while (messages.length > 1 && Buffer.byteLength(JSON.stringify(messages)) > MAX_BYTES) {
    messages.shift()
  }
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    setResponseStatus(event, 400)
    return { ok: false, error: 'Expected a trailing user message' }
  }

  // 4) System prompt (server-side; "today"/current month from the server tz).
  let settings = { currency: 'INR', locale: undefined }
  let months = []
  try { [settings, months] = await Promise.all([loadSettings(uid), loadMonthsList(uid)]) }
  catch (err) { console.error('[copilot] context load failed:', err) }
  const systemPrompt = buildSystemPrompt({
    today: serverToday(),
    currentMonth: serverCurrentMonth(),
    currency: settings.currency,
    locale: settings.locale,
    monthsAvailable: months.map((m) => m.month),
    hasData: months.length > 0,
  })

  // 5) Stream over SSE.
  const stream = createEventStream(event)
  const send = (type, data) => { try { stream.push(JSON.stringify({ type, ...(data || {}) })) } catch {} }
  const heartbeat = setInterval(() => send('ping'), 15000)
  const ac = new AbortController()
  stream.onClosed(() => { clearInterval(heartbeat); ac.abort() })

  // Drive the loop in the background; the response is the live stream.
  ;(async () => {
    try {
      await runCopilot({
        systemPrompt,
        inputItems: messages,
        uid,
        emit: send,
        signal: ac.signal,
      })
      send('done')
    }
    catch (err) {
      if (ac.signal.aborted) return // client went away — nothing to report
      console.error('[copilot] run failed:', err)
      send('error', { message: 'Copilot is unavailable right now. Please try again.' })
    }
    finally {
      clearInterval(heartbeat)
      try { await stream.close() } catch {}
    }
  })()

  return stream.send()
})
