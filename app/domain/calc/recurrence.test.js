import { describe, it, expect } from 'vitest'
import { nextOccurrence, firstOccurrence, advanceAfter, describeRecurrence } from './recurrence.js'

// Local-time anchor builder (the engine computes weekday/time in local tz, so tests are
// tz-agnostic as long as anchors are built the same way).
const ms = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime()
const DAY = 86_400_000
const HOUR = 3_600_000
const at = (t) => new Date(t)

describe('recurrence: NONE (one-shot)', () => {
  const A = ms(2026, 7, 1, 9, 0)
  it('first occurrence is the anchor; nothing after it', () => {
    expect(firstOccurrence({ freq: 'NONE' }, A)).toBe(A)
    expect(nextOccurrence({ freq: 'NONE' }, A, A)).toBe(null)
    expect(advanceAfter({ freq: 'NONE' }, A, A + 1000, A)).toBe(null)
  })
})

describe('recurrence: twice a day (DAILY + two times)', () => {
  const rec = { freq: 'DAILY', times: ['09:00', '21:00'] }
  const A = ms(2026, 7, 1, 9, 0)
  it('fires at both times, then rolls to the next day', () => {
    expect(firstOccurrence(rec, A)).toBe(ms(2026, 7, 1, 9, 0))
    expect(nextOccurrence(rec, ms(2026, 7, 1, 10, 0), A)).toBe(ms(2026, 7, 1, 21, 0))
    expect(nextOccurrence(rec, ms(2026, 7, 1, 21, 0), A)).toBe(ms(2026, 7, 2, 9, 0))
  })
})

describe('recurrence: once an hour (HOURLY interval 1)', () => {
  const rec = { freq: 'HOURLY', interval: 1 }
  const A = ms(2026, 7, 1, 10, 0)
  it('advances one hour', () => {
    expect(nextOccurrence(rec, ms(2026, 7, 1, 10, 30), A)).toBe(ms(2026, 7, 1, 11, 0))
  })
  it('catch-up after 30 days is O(1): lands within the next hour, on the grid, no replay', () => {
    const now = A + 30 * DAY + 25 * 60_000 // 30d 25m later
    const next = advanceAfter(rec, A, now, A)
    expect(next).toBeGreaterThan(now)
    expect(next - now).toBeLessThanOrEqual(HOUR)
    expect((next - A) % HOUR).toBe(0) // still on the hourly grid anchored at A
  })
})

describe('recurrence: only Sundays (WEEKLY byWeekday SU)', () => {
  const rec = { freq: 'WEEKLY', byWeekday: ['SU'] }
  const A = ms(2026, 7, 1, 9, 0) // a Wednesday per the plan; assertions are weekday-relative
  it('first fire is a Sunday at the anchor time, within a week', () => {
    const f = firstOccurrence(rec, A)
    expect(at(f).getDay()).toBe(0)
    expect(at(f).getHours()).toBe(9)
    expect(f).toBeGreaterThanOrEqual(A)
    expect(f - A).toBeLessThan(7 * DAY)
  })
  it('subsequent fires are exactly 7 days apart', () => {
    const f = firstOccurrence(rec, A)
    const next = nextOccurrence(rec, f, A)
    expect(next - f).toBe(7 * DAY)
    expect(at(next).getDay()).toBe(0)
  })
})

describe('recurrence: Sun+Mon+Fri (WEEKLY multi-weekday)', () => {
  const rec = { freq: 'WEEKLY', byWeekday: ['SU', 'MO', 'FR'] }
  const A = ms(2026, 7, 1, 9, 0)
  it('cycles through the selected weekdays in order', () => {
    let t = firstOccurrence(rec, A)
    const days = [at(t).getDay()]
    for (let i = 0; i < 5; i++) { t = nextOccurrence(rec, t, A); days.push(at(t).getDay()) }
    // every fire is one of the three selected weekdays, and consecutive fires differ
    for (const d of days) expect([0, 1, 5]).toContain(d)
    for (let i = 1; i < days.length; i++) expect(days[i]).not.toBe(days[i - 1])
  })
})

describe('recurrence: once a quarter (MONTHLY interval 3)', () => {
  const rec = { freq: 'MONTHLY', interval: 3 }
  const A = ms(2026, 1, 15, 9, 0)
  it('fires every third month on the same day', () => {
    expect(firstOccurrence(rec, A)).toBe(ms(2026, 1, 15, 9, 0))
    expect(nextOccurrence(rec, ms(2026, 1, 15, 9, 0), A)).toBe(ms(2026, 4, 15, 9, 0))
    expect(nextOccurrence(rec, ms(2026, 4, 15, 9, 0), A)).toBe(ms(2026, 7, 15, 9, 0))
    expect(nextOccurrence(rec, ms(2026, 10, 15, 9, 0), A)).toBe(ms(2027, 1, 15, 9, 0))
  })
})

describe('recurrence: twice a year (YEARLY byMonth [1,7])', () => {
  const rec = { freq: 'YEARLY', byMonth: [1, 7] }
  const A = ms(2026, 1, 10, 9, 0)
  it('fires in Jan and Jul, then rolls to next year', () => {
    expect(firstOccurrence(rec, A)).toBe(ms(2026, 1, 10, 9, 0))
    expect(nextOccurrence(rec, ms(2026, 1, 10, 9, 0), A)).toBe(ms(2026, 7, 10, 9, 0))
    expect(nextOccurrence(rec, ms(2026, 7, 10, 9, 0), A)).toBe(ms(2027, 1, 10, 9, 0))
  })
})

describe('recurrence: month-end (MONTHLY byMonthday [31]) — skip, never clamp', () => {
  const rec = { freq: 'MONTHLY', byMonthday: [31] }
  const A = ms(2026, 1, 31, 9, 0)
  it('skips months without a 31st (Feb/Apr/…), never fires on the 28th/30th', () => {
    expect(firstOccurrence(rec, A)).toBe(ms(2026, 1, 31, 9, 0))
    const next = nextOccurrence(rec, ms(2026, 1, 31, 9, 0), A)
    expect(next).toBe(ms(2026, 3, 31, 9, 0)) // Feb skipped
    expect(at(next).getDate()).toBe(31)
  })
})

describe('recurrence: impossible rule terminates (returns null, no infinite loop)', () => {
  it('MONTHLY byMonthday 31 within byMonth Feb → null', () => {
    const rec = { freq: 'MONTHLY', byMonthday: [31], byMonth: [2] }
    const A = ms(2026, 1, 31, 9, 0)
    expect(firstOccurrence(rec, A)).toBe(null)
    expect(nextOccurrence(rec, A, A)).toBe(null)
  })
})

describe('recurrence: endsAt / count', () => {
  it('endsAt caps the series in-engine', () => {
    const rec = { freq: 'DAILY', endsAt: ms(2026, 7, 3, 0, 0) }
    const A = ms(2026, 7, 1, 9, 0)
    expect(nextOccurrence(rec, ms(2026, 7, 1, 9, 0), A)).toBe(ms(2026, 7, 2, 9, 0)) // before endsAt
    expect(nextOccurrence(rec, ms(2026, 7, 2, 9, 0), A)).toBe(null) // Jul 3 09:00 is past endsAt
  })
})

describe('recurrence: DST resilience (DAILY at a wall-clock time)', () => {
  it('a daily 09:00 reminder resolves to 09:00 local every day across a month', () => {
    const rec = { freq: 'DAILY' }
    const A = ms(2026, 3, 1, 9, 0)
    let t = firstOccurrence(rec, A)
    for (let i = 0; i < 40; i++) {
      expect(at(t).getHours()).toBe(9) // wall-clock preserved regardless of any DST shift
      expect(at(t).getMinutes()).toBe(0)
      t = nextOccurrence(rec, t, A)
    }
  })
})

describe('describeRecurrence', () => {
  it('produces human labels', () => {
    expect(describeRecurrence({ freq: 'NONE' })).toBe('Does not repeat')
    expect(describeRecurrence({ freq: 'HOURLY', interval: 1 })).toBe('Every hour')
    expect(describeRecurrence({ freq: 'HOURLY', interval: 3 })).toBe('Every 3 hours')
    expect(describeRecurrence({ freq: 'DAILY', times: ['09:00', '21:00'] })).toBe('2× a day')
    expect(describeRecurrence({ freq: 'WEEKLY', byWeekday: ['SU'] })).toBe('Weekly on Sun')
    expect(describeRecurrence({ freq: 'WEEKLY', byWeekday: ['SU', 'MO', 'FR'] })).toBe('Weekly on Sun, Mon, Fri')
    expect(describeRecurrence({ freq: 'MONTHLY', interval: 3 })).toBe('Every 3 months')
    expect(describeRecurrence({ freq: 'YEARLY', byMonth: [1, 7] })).toBe('Yearly in Jan, Jul')
  })
  it('appends count / until', () => {
    expect(describeRecurrence({ freq: 'DAILY', count: 3 })).toContain('3×')
    expect(describeRecurrence({ freq: 'DAILY', endsAt: ms(2026, 12, 31) })).toContain('until')
  })
})
