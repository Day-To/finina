// Minimal, SAFE Markdown → HTML renderer for the AI copilot's replies.
// The model answers in Markdown (headings, bold, bullet/numbered lists, dividers,
// inline code, the occasional link/quote/code-block), so we render that subset.
//
// SECURITY: the source is HTML-escaped FIRST, then we emit only a fixed set of
// tags. The only dynamic attribute is a link href, which is whitelisted to
// http(s)/relative URLs with no quotes/space/brackets. No raw HTML from the model
// (or from user data echoed by it) can reach the DOM, so this is XSS-safe without
// a sanitizer dependency.

// Control-char sentinel used to shield inline-code spans during the bold/italic
// passes. It can't occur in HTML-escaped text, so it won't collide with real
// content (e.g. underscores in `get_month_summary` or a "× 3 months" number).
const NUL = String.fromCharCode(0)
const codeRe = new RegExp(NUL + '(\\d+)' + NUL, 'g')

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Inline formatting on already-escaped text: code, bold, italic, links.
function inline(text) {
  const codes = []
  let t = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c)
    return NUL + (codes.length - 1) + NUL
  })
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  t = t.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const u = url.trim()
    return /^(https?:\/\/|\/)[^\s"'<>]*$/i.test(u)
      ? '<a href="' + u + '" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">' + label + '</a>'
      : label
  })
  t = t.replace(codeRe, (_, i) =>
    '<code class="rounded bg-black/10 px-1 py-0.5 text-[0.85em] dark:bg-white/10">' + codes[Number(i)] + '</code>')
  return t
}

const H_CLASS = { 1: 'text-base font-semibold', 2: 'text-sm font-semibold', 3: 'text-sm font-semibold' }

/**
 * Render a Markdown subset to a safe HTML string (for v-html in a chat bubble).
 * @param {string} src
 * @returns {string}
 */
export function renderMarkdown(src) {
  const lines = escapeHtml(src).replace(/\r\n/g, '\n').split('\n')
  const out = []
  let para = []
  const flush = () => { if (para.length) { out.push('<p>' + inline(para.join('<br>')) + '</p>'); para = [] } }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block ```
    if (/^\s*```/.test(line)) {
      flush()
      const buf = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++ }
      i++ // skip the closing fence
      out.push('<pre class="overflow-x-auto rounded-md bg-black/10 p-2 text-[0.8em] dark:bg-white/10"><code>' + buf.join('\n') + '</code></pre>')
      continue
    }
    // Horizontal rule (---, ***, ___)
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flush(); out.push('<hr class="my-2 border-border">'); i++; continue }
    // Heading (#..######)
    const h = line.match(/^\s*(#{1,6})\s+(.*)$/)
    if (h) { flush(); out.push('<div class="mt-1 ' + (H_CLASS[h[1].length] || 'font-semibold') + '">' + inline(h[2]) + '</div>'); i++; continue }
    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      flush()
      const buf = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++ }
      out.push('<blockquote class="border-l-2 border-border pl-3 text-muted-foreground">' + inline(buf.join('<br>')) + '</blockquote>')
      continue
    }
    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      flush()
      const items = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*+]\s+/, '')); i++ }
      out.push('<ul class="my-1 list-disc space-y-0.5 pl-5">' + items.map((it) => '<li>' + inline(it) + '</li>').join('') + '</ul>')
      continue
    }
    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flush()
      const items = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++ }
      out.push('<ol class="my-1 list-decimal space-y-0.5 pl-5">' + items.map((it) => '<li>' + inline(it) + '</li>').join('') + '</ol>')
      continue
    }
    // Blank line ends a paragraph
    if (line.trim() === '') { flush(); i++; continue }
    // Plain paragraph line
    para.push(line)
    i++
  }
  flush()
  return out.join('')
}
