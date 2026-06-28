import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from './prompt.js'

describe('buildSystemPrompt', () => {
  it('includes today, the current month, the currency and the core rules', () => {
    const p = buildSystemPrompt({
      today: '2026-06-28',
      currency: 'INR',
      currentMonth: '2026-06',
      monthsAvailable: ['2026-06', '2026-05'],
      hasData: true,
    })
    expect(p).toContain('2026-06-28')
    expect(p).toContain('INR')
    expect(p).toContain('2026-06')
    expect(p).toMatch(/READ-ONLY/)
    expect(p).toMatch(/mixedCurrency/)
    expect(p).toMatch(/Never invent/i)
    // no zero-data branch when the user has data
    expect(p).not.toMatch(/NO FINANCIAL DATA/)
  })

  it('adds a zero-data guidance branch when hasData is false', () => {
    const p = buildSystemPrompt({
      today: '2026-06-28',
      currency: 'USD',
      currentMonth: '2026-06',
      monthsAvailable: [],
      hasData: false,
    })
    expect(p).toMatch(/NO FINANCIAL DATA/)
    expect(p).toContain('USD')
  })

  it('includes the locale hint when provided', () => {
    const p = buildSystemPrompt({ today: '2026-01-01', currency: 'EUR', locale: 'de-DE', currentMonth: '2026-01' })
    expect(p).toContain('de-DE')
  })
})
