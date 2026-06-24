import { describe, it, expect } from 'vitest'
import { decimalDigits, minorFactor, toMinor, fromMinor, formatMoney, sumMinor } from './money.js'

describe('decimalDigits', () => {
  it('knows minor-unit digits per currency', () => {
    expect(decimalDigits('INR')).toBe(2)
    expect(decimalDigits('USD')).toBe(2)
    expect(decimalDigits('JPY')).toBe(0)
    expect(decimalDigits('KWD')).toBe(3)
  })
  it('falls back to 2 for missing/unknown codes', () => {
    expect(decimalDigits(undefined)).toBe(2)
  })
})

describe('toMinor / fromMinor round-trip', () => {
  it('handles 2-decimal currencies', () => {
    expect(toMinor(1234.56, 'USD')).toBe(123456)
    expect(fromMinor(123456, 'USD')).toBe(1234.56)
    expect(fromMinor(toMinor(1400000, 'INR'), 'INR')).toBe(1400000)
  })
  it('handles 0-decimal currencies (JPY)', () => {
    expect(toMinor(1400, 'JPY')).toBe(1400)
    expect(fromMinor(1400, 'JPY')).toBe(1400)
  })
  it('handles 3-decimal currencies (KWD)', () => {
    expect(toMinor(1.234, 'KWD')).toBe(1234)
    expect(fromMinor(1234, 'KWD')).toBe(1.234)
  })
  it('rounds to the nearest minor unit and guards non-finite input', () => {
    expect(toMinor(0.1 + 0.2, 'USD')).toBe(30)
    expect(toMinor('not a number', 'USD')).toBe(0)
    expect(toMinor(undefined, 'USD')).toBe(0)
  })
})

describe('formatMoney', () => {
  it('formats with locale-specific grouping', () => {
    expect(formatMoney(14000000, 'INR', 'en-IN')).toContain('1,40,000')
    expect(formatMoney(140000, 'JPY', 'ja-JP')).toContain('140,000')
  })
  it('defaults to Indian digit grouping (x,xx,xx,xxx) when no locale is given', () => {
    expect(formatMoney(14000000, 'INR')).toContain('1,40,000')
  })
  it('does not throw on unknown currency', () => {
    expect(typeof formatMoney(1000, 'ZZZ')).toBe('string')
  })
})

describe('sumMinor', () => {
  it('sums integers and ignores non-finite values', () => {
    expect(sumMinor([100, 200, 300])).toBe(600)
    expect(sumMinor([100, NaN, undefined, 50])).toBe(150)
    expect(sumMinor([])).toBe(0)
  })
})

describe('minorFactor', () => {
  it('is 10 ** digits', () => {
    expect(minorFactor('USD')).toBe(100)
    expect(minorFactor('JPY')).toBe(1)
    expect(minorFactor('KWD')).toBe(1000)
  })
})
