import { describe, it, expect } from 'vitest'
import { validateToolArgs, TOOL_NAMES, TOOL_ARG_SCHEMAS } from './tools.js'

describe('copilot tool arg validation', () => {
  it('exposes a stable whitelist of tool names', () => {
    expect(TOOL_NAMES).toContain('get_overview')
    expect(TOOL_NAMES).toContain('get_month_summary')
    expect(TOOL_NAMES).toContain('get_analytics')
    expect(TOOL_NAMES.length).toBe(Object.keys(TOOL_ARG_SCHEMAS).length)
  })

  it('accepts a valid YYYY-MM month', () => {
    const r = validateToolArgs('get_month_summary', { month: '2026-06' })
    expect(r.ok).toBe(true)
    expect(r.data.month).toBe('2026-06')
  })

  it('rejects a malformed month', () => {
    expect(validateToolArgs('get_month_summary', { month: '2026-13' }).ok).toBe(false)
    expect(validateToolArgs('get_month_summary', { month: 'June' }).ok).toBe(false)
    expect(validateToolArgs('get_daily_spending', {}).ok).toBe(false)
  })

  it('rejects an unknown tool name (whitelist dispatch)', () => {
    expect(validateToolArgs('drop_tables', {}).ok).toBe(false)
    expect(validateToolArgs('drop_tables', {}).error).toBe('unknown_tool')
  })

  it('bounds list_expenses limit to <= 200', () => {
    expect(validateToolArgs('list_expenses', { month: '2026-06', limit: 5000 }).ok).toBe(false)
    expect(validateToolArgs('list_expenses', { month: '2026-06', limit: 50 }).ok).toBe(true)
  })

  it('enforces get_analytics months bounds and allows it to be omitted', () => {
    expect(validateToolArgs('get_analytics', { months: 12 }).ok).toBe(true)
    expect(validateToolArgs('get_analytics', { months: 24 }).ok).toBe(true)
    expect(validateToolArgs('get_analytics', { months: 0 }).ok).toBe(false)
    // cap aligned with the executor (max 24) so requests never silently truncate
    expect(validateToolArgs('get_analytics', { months: 60 }).ok).toBe(false)
    expect(validateToolArgs('get_analytics', {}).ok).toBe(true)
  })

  it('validates args that arrive parsed from a JSON string (B2 wire format)', () => {
    // The server JSON.parses the model\'s `arguments` string before validating.
    const argumentsString = JSON.stringify({ month: '2026-06' })
    const parsed = JSON.parse(argumentsString)
    const r = validateToolArgs('get_daily_spending', parsed)
    expect(r.ok).toBe(true)
    expect(r.data.month).toBe('2026-06')
  })

  it('only accepts monthly|yearly for get_plan', () => {
    expect(validateToolArgs('get_plan', { type: 'monthly' }).ok).toBe(true)
    expect(validateToolArgs('get_plan', { type: 'weekly' }).ok).toBe(false)
  })
})
