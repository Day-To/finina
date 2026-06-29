// Pure helpers so the Vue-Flow graph builders can give multi-line node titles
// taller vertical slots. Node titles now WRAP to the full name (instead of
// truncating with "…"), so a long name makes its node taller — the builders use
// these to space nodes by their estimated height and never overlap.

/**
 * Greedy word-wrap line count for a title rendered ~charsPerLine characters wide.
 * Mirrors how the browser wraps on spaces, and hard-breaks a single word longer
 * than the line (the nodes use `break-words`).
 * @param {string} text
 * @param {number} charsPerLine approximate characters that fit on one line
 * @returns {number} number of lines (>= 1)
 */
export function wrapLineCount(text, charsPerLine) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 1
  const cpl = Math.max(1, charsPerLine)
  let lines = 1
  let col = 0
  for (const w of words) {
    const need = col === 0 ? w.length : col + 1 + w.length
    if (need > cpl && col > 0) { lines++; col = w.length }
    else col = need
    if (col > cpl) { lines += Math.floor(col / cpl); col = col % cpl } // word longer than a line
  }
  return Math.max(1, lines)
}

/**
 * Vertical slot for a leaf whose title may wrap. A single-line title keeps the
 * existing slot (`base`) EXACTLY — only the extra wrapped lines add height — so
 * spacing is unchanged for short names and grows just enough for long ones.
 * @param {string} title
 * @param {number} base slot height for a single-line node (the old fixed ROW)
 * @param {number} charsPerLine approximate characters per line for this node width
 * @param {number} linePx pixels added per extra wrapped line
 */
export function titleSlot(title, base, charsPerLine, linePx) {
  return base + (wrapLineCount(title, charsPerLine) - 1) * linePx
}
