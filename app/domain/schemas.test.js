import { describe, it, expect } from 'vitest'
import { userSettingsSchema, surplusLineSchema, investmentAllocationSchema, investmentInputSchema } from './schemas.js'

describe('userSettingsSchema', () => {
  it('accepts a null locale (legacy docs / onboarding writes)', () => {
    expect(userSettingsSchema.safeParse({ currency: 'INR', locale: null }).success).toBe(true)
  })
  it('accepts a missing locale', () => {
    expect(userSettingsSchema.safeParse({ currency: 'INR' }).success).toBe(true)
  })
  it('rejects an invalid currency code', () => {
    expect(userSettingsSchema.safeParse({ currency: 'inr' }).success).toBe(false)
  })
})

describe('surplusLineSchema', () => {
  const base = { id: 'a', item: 'Savings' }
  it('requires integer minor units for AMOUNT', () => {
    expect(surplusLineSchema.safeParse({ ...base, mode: 'AMOUNT', value: 5000 }).success).toBe(true)
    expect(surplusLineSchema.safeParse({ ...base, mode: 'AMOUNT', value: 50.5 }).success).toBe(false)
  })
  it('allows fractional PCT', () => {
    expect(surplusLineSchema.safeParse({ ...base, mode: 'PCT', value: 33.3 }).success).toBe(true)
  })
})

describe('surplusLineSchema.target', () => {
  const base = { id: 'a', item: 'MFs', mode: 'PCT', value: 50 }
  it('defaults to null and accepts pool targets', () => {
    expect(surplusLineSchema.parse(base).target).toBe(null)
    expect(surplusLineSchema.safeParse({ ...base, target: 'MUTUAL_FUNDS' }).success).toBe(true)
    expect(surplusLineSchema.safeParse({ ...base, target: 'STOCKS' }).success).toBe(true)
    expect(surplusLineSchema.safeParse({ ...base, target: 'CRYPTO' }).success).toBe(false)
  })
})

describe('investmentAllocationSchema', () => {
  it('defaults a kind-less legacy row to a bucket and validates AMOUNT integer', () => {
    const ok = investmentAllocationSchema.safeParse({ id: 'a', bucket: 'x', mode: 'AMOUNT', value: 5000 })
    expect(ok.success).toBe(true)
    expect(ok.data.kind).toBe('bucket')
    expect(investmentAllocationSchema.safeParse({ id: 'a', bucket: 'x', mode: 'AMOUNT', value: 50.5 }).success).toBe(false)
    expect(investmentAllocationSchema.safeParse({ id: 'a', bucket: 'x', mode: 'PCT', value: 33.4 }).success).toBe(true)
  })
  it('parses an explicit fund allocation row and refines its AMOUNT', () => {
    const ok = investmentAllocationSchema.safeParse({ id: 'b', kind: 'fund', fundId: 'f1', mode: 'PCT', value: 20 })
    expect(ok.success).toBe(true)
    expect(ok.data.kind).toBe('fund')
    expect(investmentAllocationSchema.safeParse({ id: 'b', kind: 'fund', fundId: 'f1', mode: 'AMOUNT', value: 20.5 }).success).toBe(false)
  })
  it('parses a bucket row with per-fund shares', () => {
    const ok = investmentAllocationSchema.safeParse({ id: 'c', kind: 'bucket', bucket: 'long term', mode: 'PCT', value: 50, funds: [{ fundId: 'f1', pct: 60 }, { fundId: 'f2', pct: 40 }] })
    expect(ok.success).toBe(true)
    expect(ok.data.funds).toHaveLength(2)
  })
})

describe('investmentInputSchema', () => {
  it('applies defaults (active true, empty strings)', () => {
    const r = investmentInputSchema.parse({ kind: 'mutualFund', name: 'HDFC Flexi Cap' })
    expect(r.active).toBe(true)
    expect(r.bucket).toBe('')
    expect(r.weight).toBeUndefined()
  })
  it('rejects an unknown kind / blank name', () => {
    expect(investmentInputSchema.safeParse({ kind: 'crypto', name: 'x' }).success).toBe(false)
    expect(investmentInputSchema.safeParse({ kind: 'stock', name: '' }).success).toBe(false)
  })
})

describe('investmentPlanVersionSchema', () => {
  it('defaults routing arrays + label, keeps id', async () => {
    const { investmentPlanVersionSchema, investmentPlanSchema } = await import('./schemas.js')
    const v = investmentPlanVersionSchema.parse({ id: 'v1' })
    expect(v).toMatchObject({ id: 'v1', mfRouting: [], stockRouting: [], label: '' })
    // pointer: activeVersionId defaults null; legacy routing stays optional
    expect(investmentPlanSchema.parse({}).activeVersionId).toBe(null)
    expect(investmentPlanSchema.parse({ activeVersionId: 'x' }).activeVersionId).toBe('x')
  })
})

import { alertInputSchema, alertSchema, recurrenceSchema, RECURRENCE_NONE } from './schemas.js'

describe('recurrenceSchema', () => {
  it('applies NONE defaults from {}', () => {
    expect(recurrenceSchema.parse({})).toEqual(RECURRENCE_NONE)
  })
  it('accepts every named combo shape', () => {
    expect(recurrenceSchema.safeParse({ freq: 'YEARLY', byMonth: [1, 7] }).success).toBe(true)          // twice a year
    expect(recurrenceSchema.safeParse({ freq: 'DAILY', times: ['09:00', '21:00'] }).success).toBe(true) // twice a day
    expect(recurrenceSchema.safeParse({ freq: 'MONTHLY', interval: 3 }).success).toBe(true)             // once a quarter
    expect(recurrenceSchema.safeParse({ freq: 'HOURLY', interval: 1 }).success).toBe(true)              // once an hour
    expect(recurrenceSchema.safeParse({ freq: 'WEEKLY', byWeekday: ['SU'] }).success).toBe(true)        // only Sundays
    expect(recurrenceSchema.safeParse({ freq: 'WEEKLY', byWeekday: ['SU', 'MO', 'FR'] }).success).toBe(true)
  })
  it('rejects bad HH:MM and weekday', () => {
    expect(recurrenceSchema.safeParse({ freq: 'DAILY', times: ['9:00'] }).success).toBe(false)
    expect(recurrenceSchema.safeParse({ freq: 'WEEKLY', byWeekday: ['SUN'] }).success).toBe(false)
  })
})

describe('alert schemas', () => {
  it('input applies defaults', () => {
    const r = alertInputSchema.parse({ title: 'Pay rent', fireAt: 1_900_000_000_000 })
    expect(r.recurrence).toEqual(RECURRENCE_NONE)
    expect(r.attachments).toEqual([])
    expect(r.enabled).toBe(true)
  })
  it('requires title + fireAt', () => {
    expect(alertInputSchema.safeParse({ fireAt: 1 }).success).toBe(false)
    expect(alertInputSchema.safeParse({ title: 'x' }).success).toBe(false)
  })
  it('entity defaults nextFireAt to null (present, never undefined)', () => {
    const r = alertSchema.parse({ id: 'a', title: 'x', fireAt: 1 })
    expect(r.nextFireAt).toBe(null)
    expect(r.status).toBe('active')
    expect(r.startedCount).toBe(0)
  })
  it('recurrence/channels defaults are fresh mutable objects (vee-validate cast safety)', () => {
    // vee-validate/zod cast() deep-merges (mutates) resolved defaults, so a frozen or
    // shared default reference crashes useForm ("Cannot assign to read only property").
    const a = alertInputSchema.parse({ title: 'x', fireAt: 1 })
    const b = alertInputSchema.parse({ title: 'y', fireAt: 2 })
    expect(a.recurrence).not.toBe(b.recurrence)
    expect(Object.isFrozen(a.recurrence)).toBe(false)
    expect(a.channels).not.toBe(b.channels)
    a.recurrence.freq = 'DAILY'
    a.recurrence.byWeekday.push('SU')
    expect(b.recurrence.freq).toBe('NONE') // no shared-state bleed
    expect(b.recurrence.byWeekday).toEqual([])
  })
})
