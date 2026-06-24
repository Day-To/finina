// GET /api/expenses — health check (sanity-check the deployment in a browser).
export default defineEventHandler(() => ({
  ok: true,
  message: 'Finina expense API is live. POST JSON { item, amount, note?, date? } to this URL.',
}))
