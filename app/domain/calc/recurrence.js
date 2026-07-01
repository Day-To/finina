// Pure recurrence engine (RRULE-lite). Currency-/Firebase-/Vue-free. All math in
// LOCAL device tz via native Date; cross-tz is a documented v1 simplification.
// Catch-up is O(1) arithmetic start + bounded scan; impossible rules return null
// via the per-freq iteration cap (no infinite loops).

const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

function normalize(r) {
  const rec = r || {}
  return {
    freq: rec.freq || 'NONE',
    interval: Math.max(1, Math.floor(rec.interval || 1)),
    byWeekday: Array.isArray(rec.byWeekday) ? rec.byWeekday : [],
    byMonthday: Array.isArray(rec.byMonthday) ? rec.byMonthday : [],
    byMonth: Array.isArray(rec.byMonth) ? rec.byMonth : [],
    times: Array.isArray(rec.times) ? rec.times : [],
    endsAt: rec.endsAt ?? null,
    count: rec.count ?? null,
  }
}

/** Sorted [{hh,mm}]; falls back to the anchor's local time-of-day when no times. */
function timesOf(rec, anchor) {
  const parsed = rec.times
    .map((s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s)); return m ? { hh: +m[1], mm: +m[2] } : null })
    .filter((t) => t && t.hh >= 0 && t.hh <= 23 && t.mm >= 0 && t.mm <= 59)
  return parsed.length ? parsed.sort((a, b) => a.hh - b.hh || a.mm - b.mm)
    : [{ hh: anchor.getHours(), mm: anchor.getMinutes() }]
}
const weekdaySet = (rec) => new Set(rec.byWeekday.map((w) => WD.indexOf(w)).filter((i) => i >= 0))
const monthSet = (rec) => new Set(rec.byMonth.filter((m) => m >= 1 && m <= 12))
const monthdayList = (rec, anchor) => {
  const list = [...new Set(rec.byMonthday.filter((d) => d >= 1 && d <= 31))].sort((a, b) => a - b)
  return list.length ? list : [anchor.getDate()]
}
const localTs = (y, mIdx, day, hh, mm) => new Date(y, mIdx, day, hh, mm, 0, 0).getTime()
/** ms for (y,mIdx,day) or null if that day-of-month doesn't exist (e.g. Feb 31). */
function existingDay(y, mIdx, day) {
  const d = new Date(y, mIdx, day)
  return (d.getFullYear() === y && d.getMonth() === mIdx && d.getDate() === day) ? d : null
}
const withEnds = (occ, rec) => (rec.endsAt != null && occ > rec.endsAt ? null : occ)

// ── HOURLY ──────────────────────────────────────────────────────────────────
function nextHourly(rec, afterMs, anchorMs) {
  const step = rec.interval * HOUR_MS
  const wd = weekdaySet(rec); const mo = monthSet(rec)
  let k = Math.floor((afterMs - anchorMs) / step) + 1
  if (k < 0) k = 0
  let occ = anchorMs + k * step
  for (let i = 0; i < 2000; i++, occ += step) {
    if (occ <= afterMs) continue
    const d = new Date(occ)
    if (wd.size && !wd.has(d.getDay())) continue
    if (mo.size && !mo.has(d.getMonth() + 1)) continue
    return withEnds(occ, rec)
  }
  return null
}

// ── DAILY (times within each active day) ──────────────────────────────────────
function nextDaily(rec, afterMs, anchorMs) {
  const anchor = new Date(anchorMs); const times = timesOf(rec, anchor)
  const step = rec.interval; const wd = weekdaySet(rec); const mo = monthSet(rec)
  const mdAllow = rec.byMonthday.filter((d) => d >= 1 && d <= 31)
  const aMid = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
  const af = new Date(afterMs); const afMid = new Date(af.getFullYear(), af.getMonth(), af.getDate())
  let k = Math.max(0, Math.floor(Math.round((afMid - aMid) / DAY_MS) / step) - 1) // arithmetic start, back off 1
  for (let i = 0; i < 1500; i++, k++) {
    const day = new Date(aMid.getFullYear(), aMid.getMonth(), aMid.getDate() + k * step)
    if (wd.size && !wd.has(day.getDay())) continue
    if (mo.size && !mo.has(day.getMonth() + 1)) continue
    if (mdAllow.length && !mdAllow.includes(day.getDate())) continue
    for (const t of times) {
      const occ = localTs(day.getFullYear(), day.getMonth(), day.getDate(), t.hh, t.mm)
      if (occ > afterMs) return withEnds(occ, rec)
    }
  }
  return null
}

// ── WEEKLY (byWeekday EXPANDS; interval = every N weeks) ──────────────────────
function nextWeekly(rec, afterMs, anchorMs) {
  const anchor = new Date(anchorMs); const times = timesOf(rec, anchor)
  const step = rec.interval; const mo = monthSet(rec); const wd = weekdaySet(rec)
  const active = wd.size ? wd : new Set([anchor.getDay()])
  const aMid = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
  const aWeek = new Date(aMid); aWeek.setDate(aMid.getDate() - aMid.getDay()) // back to Sunday
  const af = new Date(afterMs); const afMid = new Date(af.getFullYear(), af.getMonth(), af.getDate())
  let wk = Math.max(0, Math.floor(Math.round((afMid - aWeek) / (7 * DAY_MS)) / step) - 1)
  for (let i = 0; i < 600; i++, wk++) {
    const ws = new Date(aWeek.getFullYear(), aWeek.getMonth(), aWeek.getDate() + wk * step * 7)
    for (let dow = 0; dow < 7; dow++) {
      if (!active.has(dow)) continue
      const day = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + dow)
      if (mo.size && !mo.has(day.getMonth() + 1)) continue
      for (const t of times) {
        const occ = localTs(day.getFullYear(), day.getMonth(), day.getDate(), t.hh, t.mm)
        if (occ > afterMs) return withEnds(occ, rec)
      }
    }
  }
  return null
}

// ── MONTHLY (byMonthday or anchor day; skip non-existent days; interval=months) ─
function nextMonthly(rec, afterMs, anchorMs) {
  const anchor = new Date(anchorMs); const times = timesOf(rec, anchor)
  const step = rec.interval; const mo = monthSet(rec); const wd = weekdaySet(rec)
  const mds = monthdayList(rec, anchor)
  const baseY = anchor.getFullYear(); const baseM = anchor.getMonth()
  const af = new Date(afterMs)
  const monthsDiff = (af.getFullYear() - baseY) * 12 + (af.getMonth() - baseM)
  let k = Math.max(0, Math.floor(monthsDiff / step) - 1)
  for (let i = 0; i < 600; i++, k++) {
    const mIdx = baseM + k * step
    const y = baseY + Math.floor(mIdx / 12); const m = ((mIdx % 12) + 12) % 12
    if (mo.size && !mo.has(m + 1)) continue
    for (const md of mds) {
      const dd = existingDay(y, m, md)            // RRULE: skip months without this day
      if (!dd) continue
      if (wd.size && !wd.has(dd.getDay())) continue
      for (const t of times) {
        const occ = localTs(y, m, md, t.hh, t.mm)
        if (occ > afterMs) return withEnds(occ, rec)
      }
    }
  }
  return null
}

// ── YEARLY (byMonth EXPANDS; byMonthday or anchor day; interval=years) ─────────
function nextYearly(rec, afterMs, anchorMs) {
  const anchor = new Date(anchorMs); const times = timesOf(rec, anchor)
  const step = rec.interval; const wd = weekdaySet(rec)
  const months = monthSet(rec).size ? [...monthSet(rec)].sort((a, b) => a - b) : [anchor.getMonth() + 1]
  const mds = monthdayList(rec, anchor); const baseY = anchor.getFullYear()
  let k = Math.max(0, Math.floor((new Date(afterMs).getFullYear() - baseY) / step) - 1)
  for (let i = 0; i < 400; i++, k++) {
    const y = baseY + k * step
    for (const mo of months) {
      const m = mo - 1
      for (const md of mds) {
        const dd = existingDay(y, m, md)
        if (!dd) continue
        if (wd.size && !wd.has(dd.getDay())) continue
        for (const t of times) {
          const occ = localTs(y, m, md, t.hh, t.mm)
          if (occ > afterMs) return withEnds(occ, rec)
        }
      }
    }
  }
  return null
}

/** Smallest occurrence strictly AFTER afterMs, or null (past endsAt or impossible). */
export function nextOccurrence(recurrence, afterMs, anchorMs) {
  const rec = normalize(recurrence)
  if (!Number.isFinite(anchorMs) || !Number.isFinite(afterMs)) return null
  switch (rec.freq) {
    case 'NONE': return anchorMs > afterMs ? withEnds(anchorMs, rec) : null
    case 'HOURLY': return nextHourly(rec, afterMs, anchorMs)
    case 'DAILY': return nextDaily(rec, afterMs, anchorMs)
    case 'WEEKLY': return nextWeekly(rec, afterMs, anchorMs)
    case 'MONTHLY': return nextMonthly(rec, afterMs, anchorMs)
    case 'YEARLY': return nextYearly(rec, afterMs, anchorMs)
    default: return null
  }
}

/** First occurrence on/after the anchor (the alert's first fire). */
export function firstOccurrence(recurrence, anchorMs) {
  const rec = normalize(recurrence)
  return rec.freq === 'NONE' ? withEnds(anchorMs, rec) : nextOccurrence(rec, anchorMs - 1, anchorMs)
}

/** Next FUTURE slot after a fire — jumps past every missed slot in one step. */
export function advanceAfter(recurrence, firedOccurrenceMs, nowMs, anchorMs) {
  return nextOccurrence(recurrence, Math.max(firedOccurrenceMs, nowMs), anchorMs)
}

const WD_LABEL = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' }
const MONTH_LABEL = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Human label for UI preview + notification body. */
export function describeRecurrence(recurrence) {
  const rec = normalize(recurrence)
  const n = rec.interval
  const ords = (arr, map) => arr.map((x) => map[x]).join(', ')
  let base
  switch (rec.freq) {
    case 'NONE': return 'Does not repeat'
    case 'HOURLY': base = n === 1 ? 'Every hour' : `Every ${n} hours`; break
    case 'DAILY':
      base = (rec.times.length > 1 ? `${rec.times.length}× a day` : (n === 1 ? 'Every day' : `Every ${n} days`)); break
    case 'WEEKLY':
      base = rec.byWeekday.length
        ? `${n === 1 ? 'Weekly' : `Every ${n} weeks`} on ${ords(rec.byWeekday, WD_LABEL)}`
        : (n === 1 ? 'Every week' : `Every ${n} weeks`); break
    case 'MONTHLY':
      base = (n === 1 ? 'Monthly' : `Every ${n} months`) + (rec.byMonthday.length ? ` on day ${rec.byMonthday.join(', ')}` : ''); break
    case 'YEARLY':
      base = (n === 1 ? 'Yearly' : `Every ${n} years`) + (rec.byMonth.length ? ` in ${ords(rec.byMonth, MONTH_LABEL)}` : ''); break
    default: base = ''
  }
  if (rec.count != null) base += ` · ${rec.count}×`
  else if (rec.endsAt != null) base += ` · until ${new Date(rec.endsAt).toLocaleDateString()}`
  return base
}
