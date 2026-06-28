// OpenAI Responses-API client for the Finina copilot: a server-side tool loop
// that STREAMS the assistant's answer token-by-token. The API key is read from
// env and never bundled to the client. Tools execute server-side against the
// verified uid.
//
// Wire-format invariants (Responses API):
//  - the model's function_call.arguments arrives as a JSON STRING  -> JSON.parse it
//  - function_call_output.output must be a STRING                  -> JSON.stringify it
// Tool errors are returned as a stringified { error } so the loop self-corrects
// instead of aborting the stream.
import { TOOL_DEFS, executeTool } from './copilotTools.js'

const BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
const MODEL = process.env.OPENAI_COPILOT_MODEL || 'gpt-5.4-nano-2026-03-17'
const MAX_TOOL_ROUNDS = Number(process.env.OPENAI_MAX_TOOL_ROUNDS || 6)
const MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 2000)

const TOOL_LABELS = {
  get_overview: 'Getting an overview…',
  get_month_summary: 'Reading the month summary…',
  get_daily_spending: 'Checking daily spending…',
  list_expenses: 'Looking through expenses…',
  get_flow: 'Reconciling money flow…',
  get_investments: 'Reviewing investments…',
  get_analytics: 'Crunching the trends…',
  get_plan: 'Reading your plan…',
}

/**
 * Run the streamed tool loop. Emits events via emit(type, data):
 *   token {text} · status {label} · done is signalled by resolving · error throws
 * @param {object} o
 * @param {string} o.systemPrompt
 * @param {Array<{role:string,content:string}>} o.inputItems  conversation so far
 * @param {string} o.uid                          verified user id
 * @param {(type:string,data?:object)=>void} o.emit
 * @param {AbortSignal} [o.signal]
 */
export async function runCopilot({ systemPrompt, inputItems, uid, emit, signal }) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured')
  const input = [...inputItems]

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const isFinal = round === MAX_TOOL_ROUNDS - 1
    // On the last allowed round force a text answer so the user is never left hanging.
    const { functionCalls } = await streamTurn({ systemPrompt, input, toolChoice: isFinal ? 'none' : 'auto', emit, signal })
    if (!functionCalls.length) return // model produced the final text answer

    // Re-submit the model's function_call items, then our (stringified) outputs.
    for (const fc of functionCalls) {
      input.push({ type: 'function_call', call_id: fc.call_id, name: fc.name, arguments: fc.arguments || '{}' })
    }
    for (const fc of functionCalls) {
      emit('status', { label: TOOL_LABELS[fc.name] || 'Working…' })
      let parsed = {}
      try { parsed = fc.arguments ? JSON.parse(fc.arguments) : {} }
      catch { parsed = {} }
      const result = await executeTool(uid, fc.name, parsed) // never throws
      input.push({ type: 'function_call_output', call_id: fc.call_id, output: JSON.stringify(result) })
    }
  }
}

/**
 * One streamed turn. Forwards text deltas as `token` events and returns any
 * function calls the model requested (collected defensively from both the
 * incremental item events and the terminal completed event's output[]).
 */
async function streamTurn({ systemPrompt, input, toolChoice, emit, signal }) {
  const res = await fetch(`${BASE}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      instructions: systemPrompt,
      input,
      tools: TOOL_DEFS,
      tool_choice: toolChoice,
      parallel_tool_calls: true,
      stream: true,
      max_output_tokens: MAX_OUTPUT_TOKENS,
    }),
    signal,
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const fcById = new Map() // call_id -> { call_id, name, arguments }

  const collectFc = (item) => {
    if (item?.type === 'function_call' && item.call_id) {
      fcById.set(item.call_id, { call_id: item.call_id, name: item.name, arguments: item.arguments || '' })
    }
  }
  const handle = (evt) => {
    switch (evt?.type) {
      case 'response.output_text.delta':
        if (typeof evt.delta === 'string') emit('token', { text: evt.delta })
        break
      case 'response.output_item.added':
      case 'response.output_item.done':
        collectFc(evt.item)
        break
      case 'response.completed':
      case 'response.incomplete':
        for (const it of evt.response?.output || []) collectFc(it)
        break
      case 'response.failed':
      case 'error':
        throw new Error(evt.response?.error?.message || evt.message || 'model error')
      default:
        break
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
    let idx
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n')
      if (!data || data === '[DONE]') continue
      let evt
      try { evt = JSON.parse(data) }
      catch { continue }
      handle(evt)
    }
  }
  return { functionCalls: [...fcById.values()] }
}
