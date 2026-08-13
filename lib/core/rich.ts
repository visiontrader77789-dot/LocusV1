/**
 * Edition 2.0 rich text: inline marks overlay the block's plain-text
 * `content`. This module is the single place that:
 *
 *  - renders `content + rich spans` into a safe, displayable HTML string
 *    (including `[[wiki-link]]` chips and page/URL link spans),
 *  - reads a contentEditable element back into `{ content, spans }` using
 *    one DOM walk so text and offsets can never drift apart,
 *  - merges rich data when blocks are joined,
 *  - recognises markdown-style shortcuts (`# `, `- `, `> `, `- [ ] `, …).
 *
 * Platform note: `readBlock` touches the DOM and is browser-only; the rest
 * is platform-independent.
 */
import katex from "katex";
import type { Block, BlockType, HighlightColor, InlineSpan, RichMark } from "./types";

export type { InlineSpan, RichMark };

const WIKI_LINK_RE = /\[\[([^\[\]]{1,120})\]\]/g;
const MATH_INLINE_RE = /\$([^$\n]{1,240})\$/g;

const HIGHLIGHT_COLORS = new Set<HighlightColor>(["yellow", "green", "pink", "blue", "orange", "purple"]);

/**
 * Render LaTeX to HTML using local KaTeX. Never throws on bad input —
 * `throwOnError: false` renders the source as error text instead.
 */
export function renderMath(latex: string, displayMode = false): string {
  const src = latex || "";
  if (!src.trim()) return "";
  try {
    return katex.renderToString(src, { displayMode, throwOnError: false, output: "html" });
  } catch {
    return escapeHtml(src);
  }
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function isExternalLink(link: string): boolean {
  return /^https?:\/\//i.test(link);
}

// ---------------------------------------------------------------------------
// Span helpers
// ---------------------------------------------------------------------------

function marksEqual(a: RichMark, b: RichMark): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline) &&
    Boolean(a.strike) === Boolean(b.strike) &&
    Boolean(a.code) === Boolean(b.code) &&
    (a.highlight ?? "") === (b.highlight ?? "") &&
    (a.link ?? "") === (b.link ?? "")
  );
}

function hasMarks(m: RichMark): boolean {
  return Boolean(
    m.bold || m.italic || m.underline || m.strike || m.code || m.link || m.highlight,
  );
}

/** Sort, clamp to `length`, drop empty/duplicate spans and merge neighbours. */
export function normalizeSpans(spans: InlineSpan[], length: number): InlineSpan[] {
  const len = Math.max(0, length);
  const cleaned: InlineSpan[] = [];
  for (const s of spans) {
    const from = Math.max(0, Math.min(len, Math.round(s.from) || 0));
    const to = Math.max(0, Math.min(len, Math.round(s.to) || 0));
    const mark: RichMark = {
      bold: s.bold || undefined,
      italic: s.italic || undefined,
      underline: s.underline || undefined,
      strike: s.strike || undefined,
      code: s.code || undefined,
      link: s.link ? String(s.link).slice(0, 512) : undefined,
      highlight:
        s.highlight && HIGHLIGHT_COLORS.has(s.highlight) ? s.highlight : undefined,
    };
    if (to > from && hasMarks(mark)) cleaned.push({ from, to, ...mark });
  }
  return mergeSpans(cleaned);
}

/** Merge overlapping / adjacent spans that carry identical marks. */
export function mergeSpans(spans: InlineSpan[]): InlineSpan[] {
  const sorted = [...spans].sort((a, b) => a.from - b.from || b.to - a.to);
  const out: InlineSpan[] = [];
  for (const sp of sorted) {
    const last = out[out.length - 1];
    if (
      last &&
      sp.from <= last.to &&
      marksEqual(
        { bold: last.bold, italic: last.italic, underline: last.underline, strike: last.strike, code: last.code, link: last.link, highlight: last.highlight },
        { bold: sp.bold, italic: sp.italic, underline: sp.underline, strike: sp.strike, code: sp.code, link: sp.link, highlight: sp.highlight },
      )
    ) {
      last.to = Math.max(last.to, sp.to);
    } else {
      out.push({ ...sp });
    }
  }
  return out;
}

/** Concatenate two blocks' text, shifting the second block's spans. */
export function concatBlocks(a: Block, b: Block): { content: string; rich: InlineSpan[] } {
  const content = a.content + b.content;
  const shifted = (b.rich ?? []).map((s) => ({
    ...s,
    from: s.from + a.content.length,
    to: s.to + a.content.length,
  }));
  return { content, rich: mergeSpans([...(a.rich ?? []), ...shifted]) };
}

/** Every link target referenced by a block: `[[wiki-links]]` + rich link spans. */
export function collectBlockLinks(block: Block): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const l of extractWikiLinks(block.content)) {
    const t = l.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  for (const s of block.rich ?? []) {
    if (!s.link) continue;
    const t = s.link.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

function extractWikiLinks(text: string): string[] {
  const out: string[] = [];
  WIKI_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKI_LINK_RE.exec(text)) !== null) out.push(m[1]);
  return out;
}

// ---------------------------------------------------------------------------
// Rendering: content + spans -> HTML string (with optional [[link]] chips)
// ---------------------------------------------------------------------------

interface Seg {
  from: number;
  to: number;
  chip?: string;
  math?: string;
  marks: RichMark;
}

function buildSegments(
  content: string,
  spans: InlineSpan[],
  chips: Array<{ from: number; to: number; title: string }>,
  mathRanges: Array<{ from: number; to: number; latex: string }>,
): Seg[] {
  const len = content.length;
  const segs: Seg[] = [{ from: 0, to: len, marks: {} }];
  const splitAt = (pos: number) => {
    if (pos <= 0 || pos >= len) return;
    for (let i = 0; i < segs.length; i += 1) {
      const s = segs[i];
      if (pos > s.from && pos < s.to) {
        segs.splice(i + 1, 0, { from: pos, to: s.to, marks: { ...s.marks }, chip: s.chip, math: s.math });
        s.to = pos;
        return;
      }
    }
  };
  for (const c of chips) {
    splitAt(c.from);
    splitAt(c.to);
  }
  for (const m of mathRanges) {
    splitAt(m.from);
    splitAt(m.to);
  }
  for (const sp of spans) {
    splitAt(sp.from);
    splitAt(sp.to);
  }
  for (const sp of spans) {
    for (const s of segs) {
      if (s.from >= sp.from && s.to <= sp.to) {
        s.marks = {
          bold: s.marks.bold || sp.bold,
          italic: s.marks.italic || sp.italic,
          underline: s.marks.underline || sp.underline,
          strike: s.marks.strike || sp.strike,
          code: s.marks.code || sp.code,
          link: s.marks.link ?? sp.link,
          highlight: s.marks.highlight ?? sp.highlight,
        };
      }
    }
  }
  for (const c of chips) {
    for (const s of segs) {
      if (s.from >= c.from && s.to <= c.to) s.chip = c.title;
    }
  }
  for (const m of mathRanges) {
    for (const s of segs) {
      if (s.from >= m.from && s.to <= m.to) s.math = m.latex;
    }
  }
  return segs.filter((s) => s.to > s.from);
}

function wrapSeg(text: string, marks: RichMark): string {
  let out = escapeHtml(text);
  if (marks.code) out = `<code class="editor-inline-code">${out}</code>`;
  if (marks.link) {
    const ext = isExternalLink(marks.link);
    out = ext
      ? `<a class="inline-link" data-link="${escapeAttr(marks.link)}" data-external="true" href="${escapeAttr(marks.link)}" target="_blank" rel="noopener noreferrer">${out}</a>`
      : `<a class="inline-link" data-link="${escapeAttr(marks.link)}" href="#">${out}</a>`;
  }
  if (marks.bold) out = `<b>${out}</b>`;
  if (marks.italic) out = `<i>${out}</i>`;
  if (marks.underline) out = `<u>${out}</u>`;
  if (marks.strike) out = `<s>${out}</s>`;
  if (marks.highlight) out = `<mark class="hl-${marks.highlight}">${out}</mark>`;
  return out;
}

/**
 * Render a block's content + spans as safe HTML.
 * `chips: true` turns `[[Page]]` into clickable chips (used when blurred).
 * `chips: false` leaves them as plain text (used while editing).
 */
export function richHtml(content: string, spans?: InlineSpan[] | null, chips = true): string {
  const normal = spans ? normalizeSpans(spans, content.length) : [];
  const chipRanges: Array<{ from: number; to: number; title: string }> = [];
  const mathRanges: Array<{ from: number; to: number; latex: string }> = [];
  if (chips) {
    WIKI_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIKI_LINK_RE.exec(content)) !== null) {
      const from = m.index;
      const to = from + m[0].length;
      const overlaps = normal.some((s) => s.from < to && s.to > from);
      if (!overlaps) chipRanges.push({ from, to, title: m[1].trim() });
    }
    MATH_INLINE_RE.lastIndex = 0;
    while ((m = MATH_INLINE_RE.exec(content)) !== null) {
      const from = m.index;
      const to = from + m[0].length;
      const overlaps =
        normal.some((s) => s.from < to && s.to > from) ||
        chipRanges.some((c) => c.from < to && c.to > from);
      if (!overlaps) mathRanges.push({ from, to, latex: m[1] });
    }
  }
  if (normal.length === 0 && chipRanges.length === 0 && mathRanges.length === 0) {
    return escapeHtml(content).replace(/\n/g, "<br>");
  }
  const segs = buildSegments(content, normal, chipRanges, mathRanges);
  return segs
    .map((s) => {
      if (s.chip) return `<span class="link-chip" data-link="${escapeAttr(s.chip)}">${escapeHtml(s.chip)}</span>`;
      if (s.math !== undefined) return `<span class="math-inline" data-math="${escapeAttr(s.math)}">${renderMath(s.math)}</span>`;
      return wrapSeg(content.slice(s.from, s.to), s.marks).replace(/\n/g, "<br>");
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Reading a contentEditable block back into content + spans
// ---------------------------------------------------------------------------

type BoolMark = Exclude<keyof RichMark, "link" | "highlight">;

const MARK_TAGS: Record<string, BoolMark> = {
  B: "bold",
  STRONG: "bold",
  I: "italic",
  EM: "italic",
  U: "underline",
  S: "strike",
  STRIKE: "strike",
  DEL: "strike",
  CODE: "code",
};

function marksFromElement(el: Element, root: Element): RichMark {
  const marks: RichMark = {};
  let node: Element | null = el;
  while (node && node !== root) {
    const tag = node.tagName;
    if (MARK_TAGS[tag]) marks[MARK_TAGS[tag]] = true;
    else if (tag === "MARK") {
      const m = /hl-(yellow|green|pink|blue|orange|purple)/.exec(node.className || "");
      if (m) marks.highlight = m[1] as HighlightColor;
    } else if (tag === "A") {
      const link = node.getAttribute("data-link") || node.getAttribute("href") || "";
      if (link) marks.link = link;
    }
    node = node.parentElement;
  }
  // Fallback for pasted markup styled with CSS instead of tags.
  const cs = window.getComputedStyle(el);
  if (!marks.bold && cs.fontWeight && Number.parseFloat(cs.fontWeight) >= 600) marks.bold = true;
  if (!marks.italic && cs.fontStyle === "italic") marks.italic = true;
  if (!marks.underline && cs.textDecorationLine.includes("underline")) marks.underline = true;
  if (!marks.strike && cs.textDecorationLine.includes("line-through")) marks.strike = true;
  if (!marks.code && /monospace|ui-monospace/i.test(cs.fontFamily)) marks.code = true;
  return marks;
}

/**
 * Read a contentEditable element into plain text + inline spans in one pass,
 * so offsets always line up with `content`. Soft line breaks (`<br>`) are
 * preserved as `\n` characters so Shift+Enter breaks survive a reload.
 */
/**
 * Normalize editor text read from the DOM. Browsers encode a trailing space
 * typed at the end of a contentEditable line as U+00A0 (NBSP) so it survives
 * re-renders; flatten it to a regular space so markdown matching and rich-text
 * parsing see what the user actually typed.
 */
export function normalizeEditorText(content: string): string {
  return content.replace(/\u00a0/g, " ");
}

export function readBlock(el: HTMLElement): { content: string; spans: InlineSpan[] } {
  const root = el;
  const parts: string[] = [];
  const spans: InlineSpan[] = [];
  let offset = 0;
  const emit = (text: string, node: Element | null) => {
    if (text.length === 0) return;
    if (node) {
      const marks = marksFromElement(node, root);
      if (hasMarks(marks)) spans.push({ from: offset, to: offset + text.length, ...marks });
    }
    parts.push(text);
    offset += text.length;
  };
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      emit(node.textContent ?? "", node.parentElement);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const eln = node as Element;
      if (eln.classList.contains("link-chip")) return; // chips are unwrapped while editing
      if (eln.tagName === "BR") {
        emit("\n", eln);
        return;
      }
      for (const child of Array.from(eln.childNodes)) walk(child);
    }
  };
  for (const child of Array.from(el.childNodes)) walk(child);
  return { content: normalizeEditorText(parts.join("")), spans: mergeSpans(spans) };
}

// ---------------------------------------------------------------------------
// Paste sanitisation: untrusted HTML -> safe inline HTML the editor can render
// ---------------------------------------------------------------------------

const PASTE_DROP_TAGS = new Set([
  "script", "style", "iframe", "object", "embed", "link", "meta", "base",
  "form", "input", "button", "select", "textarea", "svg", "canvas", "video",
  "audio", "applet", "param", "template", "noscript", "frame", "frameset",
]);

const PASTE_BLOCK_TAGS = new Set([
  "P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "UL", "OL",
  "TABLE", "TR", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "ASIDE",
]);

/**
 * Strip untrusted HTML from the clipboard down to the small subset the editor
 * supports (bold/italic/underline/strike/code/inline-code/marks/links + soft
 * breaks). Returns safe HTML ready for `execCommand("insertHTML", …)`.
 * Browser-only (uses DOMParser).
 */
export function sanitizePasteHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walkChildren = (parent: Element): string => {
    let out = "";
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        out += escapeHtml(node.textContent ?? "");
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        out += walk(node as Element);
      }
    }
    return out;
  };
  const walk = (node: Element): string => {
    const tag = node.tagName;
    if (PASTE_DROP_TAGS.has(tag.toLowerCase())) return "";
    if (tag === "BR") return "<br>";
    if (tag === "A") {
      const href = node.getAttribute("href") ?? "";
      const safe = /^(https?:\/\/|mailto:)/i.test(href) ? href : "";
      const inner = walkChildren(node);
      return safe && inner
        ? `<a class="inline-link" data-link="${escapeAttr(safe)}" data-external="${/^https?:/i.test(safe) ? "true" : "false"}" href="${escapeAttr(safe)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
        : inner;
    }
    if (tag === "MARK") {
      const m = /hl-(yellow|green|pink|blue|orange|purple)/.exec(node.className || "");
      const inner = walkChildren(node);
      return m ? `<mark class="${m[1]}">${inner}</mark>` : inner;
    }
    if (tag === "CODE" && !node.closest("pre")) {
      return `<code class="editor-inline-code">${walkChildren(node)}</code>`;
    }
    if (tag === "SPAN") {
      const style = node.getAttribute("style") ?? "";
      let out = walkChildren(node);
      if (/\bfont-style\s*:\s*italic/i.test(style)) out = `<i>${out}</i>`;
      if (/\bfont-weight\s*:\s*(bold|[5-9]00)/i.test(style)) out = `<b>${out}</b>`;
      if (/text-decoration\s*:[^;]*underline/i.test(style)) out = `<u>${out}</u>`;
      if (/text-decoration\s*:[^;]*line-through/i.test(style)) out = `<s>${out}</s>`;
      return out;
    }
    if (tag === "STRONG") return `<b>${walkChildren(node)}</b>`;
    if (tag === "EM") return `<i>${walkChildren(node)}</i>`;
    if (tag === "STRIKE" || tag === "DEL") return `<s>${walkChildren(node)}</s>`;
    if (tag === "CODE") return `<code class="editor-inline-code">${walkChildren(node)}</code>`;
    if (["B", "I", "U", "SUB", "SUP", "SMALL"].includes(tag)) {
      return `<${tag.toLowerCase()}>${walkChildren(node)}</${tag.toLowerCase()}>`;
    }
    const inner = walkChildren(node);
    return PASTE_BLOCK_TAGS.has(tag) ? `${inner}<br>` : inner;
  };
  return walkChildren(doc.body).replace(/(<br>)+$/, "");
}

// ---------------------------------------------------------------------------
// Markdown-style shortcuts
// ---------------------------------------------------------------------------

export interface MarkdownMatch {
  type: BlockType;
  checked?: boolean;
  /** Text left after the marker is removed. */
  content: string;
}

const MARKDOWN_PATTERNS: Array<{ re: RegExp; type: BlockType; checked?: boolean }> = [
  { re: /^```$/, type: "code" },
  { re: /^### $/, type: "heading3" },
  { re: /^## $/, type: "heading2" },
  { re: /^# $/, type: "heading1" },
  { re: /^> $/, type: "quote" },
  { re: /^- \[x\] $/, type: "todoList", checked: true },
  { re: /^- \[ \] $/, type: "todoList", checked: false },
  { re: /^\[\] $/, type: "todoList", checked: false },
  { re: /^\[ \] $/, type: "todoList", checked: false },
  { re: /^\d+\. $/, type: "numberedList" },
];

/**
 * Match a completed markdown marker (e.g. content is exactly "# " or "1. ").
 * Checked first so `- [ ] ` wins over any `- ` handling.
 */
export function matchMarkdown(content: string): MarkdownMatch | null {
  for (const p of MARKDOWN_PATTERNS) {
    if (p.re.test(content)) return { type: p.type, checked: p.checked, content: "" };
  }
  return null;
}

/**
 * Bullet conversion is deferred: "- " alone stays text so "- [ ] " can still
 * type through to a checklist. It converts once a non-"[", non-space character
 * follows the marker (returns the text after the marker).
 */
export function matchDeferredBullet(content: string): MarkdownMatch | null {
  if (!content.startsWith("- ")) return null;
  const rest = content.slice(2);
  if (rest.length === 0 || rest.startsWith("[")) return null;
  return { type: "bulletList", content: rest };
}

/** True when the user is mid-way through typing a `- [ ]` checklist marker. */
export function isTodoPrefix(content: string): boolean {
  return content === "-" || content === "- [" || content === "- [ ]" || content === "- [x" || content === "- [x]" || /^-\s+\[\w?\]?$/.test(content);
}

/** Turn a bare "- " (or "```") into its block type on Enter / blur. */
export function matchBareMarker(content: string): MarkdownMatch | null {
  if (content === "- ") return { type: "bulletList", content: "" };
  if (content === "```") return { type: "code", content: "" };
  return null;
}
