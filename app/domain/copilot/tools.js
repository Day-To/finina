// Single source of truth for the AI copilot's tool NAMES and ARGUMENT shapes.
// Pure (Zod only) — no Firestore, no Vue — so it is importable by the server
// (which validates incoming tool-call args) AND unit-testable. The OpenAI
// function/tool JSON-schemas (the `parameters` blocks) live in
// server/utils/copilotTools.js next to the executors; they must stay in sync
// with the Zod schemas here.

import { z } from 'zod'

/** "YYYY-MM" period key — same shape the rest of the app uses. */
export const monthArg = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM')

/** Per-tool argument schemas. The keys are the canonical tool names. */
export const TOOL_ARG_SCHEMAS = {
  get_overview: z.object({}),
  get_month_summary: z.object({ month: monthArg }),
  get_daily_spending: z.object({ month: monthArg }),
  list_expenses: z.object({
    month: monthArg,
    query: z.string().max(100).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  get_flow: z.object({ month: monthArg }),
  get_investments: z.object({ month: monthArg }),
  get_analytics: z.object({ months: z.number().int().min(1).max(24).optional() }),
  get_plan: z.object({ type: z.enum(['monthly', 'yearly']) }),
}

/** The whitelist of dispatchable tool names. */
export const TOOL_NAMES = Object.keys(TOOL_ARG_SCHEMAS)

/**
 * Validate a tool call's arguments. Args may arrive already-parsed from the
 * model's JSON `arguments` string (the server JSON.parses before calling this).
 * @param {string} name
 * @param {unknown} args
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function validateToolArgs(name, args) {
  const schema = TOOL_ARG_SCHEMAS[name]
  if (!schema) return { ok: false, error: 'unknown_tool' }
  const result = schema.safeParse(args ?? {})
  if (result.success) return { ok: true, data: result.data }
  return { ok: false, error: result.error.issues.map((i) => `${i.path.join('.') || 'arg'}: ${i.message}`).join('; ') }
}
