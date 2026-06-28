// Zod schemas — the single source of truth for entity shapes (§4).
// Used both as Firestore converters' validation boundary AND as form schemas.
//
// Amounts are integer MINOR UNITS (see money.js). Timestamps are repo-managed
// (serverTimestamp on write, Firestore Timestamp on read), so they are validated
// leniently here — the meaningful, user-editable fields are validated strictly.

import { z } from 'zod'

// ── Primitives ───────────────────────────────────────────────────────────────

/** Client-generated record id (UUID) or natural key. */
export const recordId = z.string().min(1)

/** ISO 4217 currency code (3 uppercase letters). */
export const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'Invalid currency code')

/** "YYYY-MM" period key. */
export const monthId = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM')

/** Repo-managed timestamp (serverTimestamp sentinel | Firestore Timestamp | Date). */
export const timestamp = z.any()

/** Integer minor-unit amount, non-negative (stored amounts never go below 0). */
export const minorAmount = z.number().int().nonnegative()

const order = z.number().int().nonnegative()
const lineSource = z.enum(['MONTHLY', 'YEARLY', 'MANUAL'])

// ── Line items ───────────────────────────────────────────────────────────────

export const fixedLineSchema = z.object({
  id: recordId,
  item: z.string().trim().min(1, 'Required'),
  amount: minorAmount,
  order: order.default(0),
  source: lineSource.optional(),
})

export const variableLineSchema = fixedLineSchema.extend({
  isDailyBudget: z.boolean().default(false),
})

export const surplusLineSchema = z
  .object({
    id: recordId,
    item: z.string().trim().min(1, 'Required'),
    mode: z.enum(['PCT', 'AMOUNT']),
    // PCT: a percentage (0–100). AMOUNT: integer minor units. Both non-negative.
    value: z.number().nonnegative(),
    // Route this surplus line into an investment pool instead of the bank flow.
    target: z.enum(['MUTUAL_FUNDS', 'STOCKS']).nullable().default(null),
    // Route DIRECTLY to one holding (fund/stock id) instead of the pool's spread.
    // Null = pool route (or none). Its kind is implied by `target`. Ignored if target null.
    targetFundId: recordId.nullable().default(null),
    // A routed line counts as an investment (emerald) by default. false = "Parked":
    // money still flows to the holding but is tracked as saving (green), excluded
    // from investment totals. Only meaningful for direct (targetFundId) routes.
    countAsInvestment: z.boolean().default(true),
    order: order.default(0),
    source: lineSource.optional(),
  })
  .superRefine((line, ctx) => {
    if (line.mode === 'AMOUNT' && !Number.isInteger(line.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'AMOUNT value must be integer minor units' })
    }
  })

// ── Investments ───────────────────────────────────────────────────────────────

export const investmentKind = z.enum(['mutualFund', 'stock'])

// Holding INPUT (form-validated; repo stamps id/createdAt/updatedAt). Identities
// + metadata, no amounts — mirrors bankAccountInputSchema.
export const investmentInputSchema = z.object({
  kind: investmentKind,
  name: z.string().trim().min(1, 'Name is required'),
  bucket: z.string().trim().optional().default(''), // '' => Unbucketed; a default grouping hint
  category: z.string().trim().optional().default(''),
  subCategory: z.string().trim().optional().default(''), // MF only
  platform: z.string().trim().optional().default(''), // Stock only
  active: z.boolean().default(true), // false => PAUSED (distinct from archived)
  archived: z.boolean().default(false), // soft-delete: retired, gone from new work
  order: order.default(0),
})

export const investmentSchema = investmentInputSchema.extend({
  id: recordId,
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
  archivedAt: timestamp.nullable().optional(),
})

// Per-fund share within a bucket allocation. pct is advisory + normalized.
export const fundShareSchema = z.object({
  fundId: recordId,
  pct: z.number().nonnegative().default(0),
})

const amountIntRefine = (line, ctx) => {
  if (line.mode === 'AMOUNT' && !Number.isInteger(line.value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'AMOUNT value must be integer minor units' })
  }
}

// A routing entry is either a bucket (→ its funds by per-fund %) or a single
// fund (→ that fund directly). mode dual-use like surplusLineSchema: PCT 0–100
// of the variable pool; AMOUNT integer minor units (taken FIXED first).
// NOTE: members are PLAIN z.object (no .superRefine) — z.discriminatedUnion
// requires raw ZodObject options; the integer-AMOUNT refine is attached to the
// UNION below (both branches carry mode/value, so one refine covers both).
export const bucketAllocationSchema = z.object({
  id: recordId,
  kind: z.literal('bucket'),
  bucket: z.string().trim().default(''),
  mode: z.enum(['PCT', 'AMOUNT']),
  value: z.number().nonnegative(),
  funds: z.array(fundShareSchema).default([]),
  order: order.default(0),
})

export const fundAllocationSchema = z.object({
  id: recordId,
  kind: z.literal('fund'),
  fundId: recordId,
  mode: z.enum(['PCT', 'AMOUNT']),
  value: z.number().nonnegative(),
  order: order.default(0),
})

// Back-compat: legacy rows have no `kind` → default to 'bucket' before the union.
// (Named investmentAllocationSchema to avoid clashing with the flow allocationSchema.)
export const investmentAllocationSchema = z.preprocess(
  (v) => (v && typeof v === 'object' && !Array.isArray(v) && !v.kind ? { ...v, kind: 'bucket' } : v),
  z.discriminatedUnion('kind', [bucketAllocationSchema, fundAllocationSchema]).superRefine(amountIntRefine),
)

// Reusable routing-plan POINTER (users/{uid}/investmentPlan/plan) → its active
// version. mfRouting/stockRouting are LEGACY fields kept optional so a one-time
// migration can lift pre-versioning routing into version 1.
export const investmentPlanSchema = z.object({
  activeVersionId: recordId.nullable().default(null),
  mfRouting: z.array(investmentAllocationSchema).optional(),
  stockRouting: z.array(investmentAllocationSchema).optional(),
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
})

// Immutable, append-only routing-plan version
// (users/{uid}/investmentPlan/plan/versions/{id}).
export const investmentPlanVersionSchema = z.object({
  id: recordId,
  mfRouting: z.array(investmentAllocationSchema).default([]),
  stockRouting: z.array(investmentAllocationSchema).default([]),
  label: z.string().trim().default(''),
  basedOn: recordId.nullable().optional(),
  createdAt: timestamp.optional(),
})

export const todoLineSchema = z.object({
  id: recordId,
  label: z.string().trim().min(1, 'Required'),
  isAuto: z.boolean().default(false),
  order: order.default(0),
})

export const checklistLineSchema = z.object({
  id: recordId,
  label: z.string().trim().min(1, 'Required'),
  isDone: z.boolean().default(false),
  isAuto: z.boolean().default(false),
  // Stable key for auto (transfer) to-dos so done-state survives a re-sync even
  // when the formatted label changes (amount edits / account renames).
  accountId: recordId.nullable().optional(),
  order: order.default(0),
})

export const allocationSchema = z.object({
  accountId: recordId,
  sourceIds: z.array(recordId).default([]),
})

export const flowSchema = z.object({
  incomeAccountId: recordId.nullable().default(null),
  allocations: z.array(allocationSchema).default([]),
})

// Yearly recurring rows carry a due month/day.
export const yearlyFixedLineSchema = z.object({
  id: recordId,
  item: z.string().trim().min(1, 'Required'),
  amount: minorAmount,
  recurMonth: z.number().int().min(1).max(12),
  recurDay: z.number().int().min(1).max(31),
  order: order.default(0),
})

export const yearlyVariableLineSchema = yearlyFixedLineSchema

// ── Entities ─────────────────────────────────────────────────────────────────

// UserSettings live on the users/{uid} doc.
export const userSettingsSchema = z.object({
  currency: currencyCode,
  // Accept null so docs that stored an explicit null locale still parse.
  locale: z.string().nullable().optional(),
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
})

// BankAccount — identities only, no amounts (so no currency field).
export const bankAccountInputSchema = z.object({
  name: z.string().trim().min(1, 'Nickname is required'),
  bankName: z.string().trim().optional().default(''),
  accountNumber: z.string().trim().optional().default(''),
  ifsc: z.string().trim().toUpperCase().optional().default(''),
  tags: z.array(z.string().trim().min(1)).default([]),
  archived: z.boolean().default(false), // soft-delete: hidden from pickers/new work
})

export const bankAccountSchema = bankAccountInputSchema.extend({
  id: recordId,
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
  archivedAt: timestamp.nullable().optional(),
})

export const planSchema = z.object({
  type: z.enum(['monthly', 'yearly']),
  activeVersionId: recordId.nullable().default(null),
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
})

// Plan version BODIES (what the wizard builds / edits). The repo stamps id,
// currency, createdAt on top of the body when saving a new version.
export const monthlyVersionBodySchema = z.object({
  label: z.string().trim().default(''),
  basedOn: recordId.nullable().default(null),
  income: minorAmount.default(0),
  fixedExpenses: z.array(fixedLineSchema).default([]),
  variableExpenses: z.array(variableLineSchema).default([]),
  surplus: z.array(surplusLineSchema).default([]),
  flow: flowSchema.default({ incomeAccountId: null, allocations: [] }),
  todos: z.array(todoLineSchema).default([]),
})

export const monthlyVersionSchema = monthlyVersionBodySchema.extend({
  id: recordId,
  currency: currencyCode,
  createdAt: timestamp.optional(),
})

export const yearlyVersionBodySchema = z.object({
  label: z.string().trim().default(''),
  basedOn: recordId.nullable().default(null),
  fixedExpenses: z.array(yearlyFixedLineSchema).default([]),
  variableExpenses: z.array(yearlyVariableLineSchema).default([]),
})

export const yearlyVersionSchema = yearlyVersionBodySchema.extend({
  id: recordId,
  currency: currencyCode,
  createdAt: timestamp.optional(),
})

export const seededFromSchema = z
  .object({
    monthlyVersionId: recordId.nullable().default(null),
    yearlyVersionId: recordId.nullable().default(null),
  })
  .nullable()

// Month — materialized, editable instance.
export const monthSchema = z.object({
  month: monthId,
  currency: currencyCode,
  seededFrom: seededFromSchema.default(null),
  income: minorAmount.default(0),
  fixedExpenses: z.array(fixedLineSchema).default([]),
  variableExpenses: z.array(variableLineSchema).default([]),
  surplus: z.array(surplusLineSchema).default([]),
  flow: flowSchema.default({ incomeAccountId: null, allocations: [] }),
  // Per-month snapshot of the investment routing plan (editable per month) +
  // a FROZEN snapshot of the holdings it distributes over, so archiving/editing a
  // fund later never changes this month's split. Members carry NO `archived` —
  // the Archived badge is a live property resolved from the registry.
  investments: z.object({
    mf: z.array(investmentAllocationSchema).default([]),
    stocks: z.array(investmentAllocationSchema).default([]),
    holdings: z.array(z.object({
      id: recordId, kind: investmentKind, name: z.string().default(''),
      bucket: z.string().default(''), active: z.boolean().default(true),
    })).default([]),
    // true once a month has frozen its holdings (even if empty) — distinguishes an
    // intentionally-empty snapshot from a legacy month that predates the snapshot.
    holdingsFrozen: z.boolean().default(false),
  }).default({ mf: [], stocks: [], holdings: [], holdingsFrozen: false }),
  checklist: z.array(checklistLineSchema).default([]),
  // Free-form notes for this month (plain text, may be multi-line).
  notes: z.string().default(''),
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
})

// DailyExpense — logged against the month's daily budget.
export const dailyExpenseInputSchema = z.object({
  // 'YYYY-MM-DD' calendar date (local).
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  item: z.string().trim().min(1, 'Required'),
  amount: minorAmount,
  note: z.string().trim().optional().default(''),
  // Reserved for v2 bucket/category tagging; unused in v1.
  category: z.null().default(null),
})

export const dailyExpenseSchema = dailyExpenseInputSchema.extend({
  id: recordId,
  currency: currencyCode,
  createdAt: timestamp.optional(),
})

// ── AI Copilot chat ──────────────────────────────────────────────────────────

export const chatRole = z.enum(['user', 'assistant'])

// One message in a copilot thread (users/{uid}/chatThreads/{tid}/messages/{id}).
// `seq` is a CLIENT-set monotonic order key (mirrors the `order` convention on
// line items) so the UI orders deterministically even before serverTimestamp()
// resolves — avoids the user/assistant pair flipping on first paint.
export const chatMessageSchema = z.object({
  id: recordId,
  role: chatRole,
  content: z.string().default(''),
  status: z.enum(['complete', 'error']).default('complete'),
  seq: z.number().int().nonnegative().default(0),
  createdAt: timestamp.optional(),
})

// A conversation thread (users/{uid}/chatThreads/{tid}).
export const chatThreadSchema = z.object({
  id: recordId,
  title: z.string().default(''),
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
})

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse with a schema, returning { success, data, error } without throwing.
 * @template T
 * @param {import('zod').ZodType<T>} schema
 * @param {unknown} value
 */
export function safeParse(schema, value) {
  return schema.safeParse(value)
}
