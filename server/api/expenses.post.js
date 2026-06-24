// POST /api/expenses — add one daily expense. Drop-in replacement for the old
// Apps Script webhook. Body: JSON { item, amount, note?, date? }.
//   amount is in MAJOR units (e.g. 250 = ₹250); date defaults to today.
// If EXPENSE_API_TOKEN is set, the request must supply it via the
// `x-api-token` header, an `Authorization: Bearer <token>` header, or `?token=`.
import { addExpense } from '../utils/expenses.js'

function assertAuthorized(event) {
  const required = process.env.EXPENSE_API_TOKEN
  if (!required) return // no token configured → open (secret-URL model)
  const bearer = (getHeader(event, 'authorization') || '').replace(/^Bearer\s+/i, '')
  const provided = getHeader(event, 'x-api-token') || bearer || getQuery(event).token
  if (provided !== required) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
}

export default defineEventHandler(async (event) => {
  try {
    assertAuthorized(event)
    let body = await readBody(event)
    if (typeof body === 'string') {
      try { body = JSON.parse(body) }
      catch { throw new Error('Invalid JSON body.') }
    }
    if (!body || typeof body !== 'object') throw new Error('Empty POST body. Send JSON { item, amount, note?, date? }.')
    const result = await addExpense(body)
    return { ok: true, ...result }
  }
  catch (err) {
    setResponseStatus(event, err?.statusCode || 400)
    return { ok: false, error: String(err?.statusMessage || err?.message || err) }
  }
})
