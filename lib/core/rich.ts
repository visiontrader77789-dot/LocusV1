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
import type { Block, BlockType, InlineSpan, RichMark } from "./types";

export type { InlineSpan, RichMark };

const WIKI_LINK_RE = /\[\[([^\[\]]{1,120})\]\]/g;

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
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
    (a.link ?? "") === (b.link ?? "")
  );
}

function hasMarks(m: RichMark): boolean {
  return Boolean(
    m.bold || m.italic || m.underline || m.strike || m.code || m.link,
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
        { bold: last.bold, italic: last.italic, underline: last.underline, strike: last.strike, code: last.code, link: last.link },
        { bold: sp.bold, italic: sp.italic, underline: sp.underline, strike: sp.strike, code: sp.code, link: sp.link },
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
  marks: RichMark;
}

function buildSegments(content: string, spans: InlineSpan[], chips: Array<{ from: number; to: number; title: string }>): Seg[] {
  const len = content.length;
  const segs: Seg[] = [{ from: 0, to: len, marks: {} }];
  const splitAt = (pos: number) => {
    if (pos <= 0 || pos >= len) return;
    for (let i = 0; i < segs.length; i += 1) {
      const s = segs[i];
      if (pos > s.from && pos < s.to) {
        segs.splice(i + 1, 0, { from: pos, to: s.to, marks: { ...s.marks }, chip: s.chip });
        s.to = pos;
        return;
      }
    }
  };
  for (const c of chips) {
    splitAt(c.from);
    splitAt(c.to);
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
        };
      }
    }
  }
  for (const c of chips) {
    for (const s of segs) {
      if (s.from >= c.from && s.to <= c.to) s.chip = c.title;
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
  if (chips) {
    WIKI_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIKI_LINK_RE.exec(content)) !== null) {
      const from = m.index;
      const to = from + m[0].length;
      const overlaps = normal.some((s) => s.from < to && s.to > from);
      if (!overlaps) chipRanges.push({ from, to, title: m[1].trim() });
    }
  }
  if (normal.length === 0 && chipRanges.length === 0) return escapeHtml(content);
  const segs = buildSegments(content, normal, chipRanges);
  return segs.map((s) => (s.chip ? `<span class="link-chip" data-link="${escapeAttr(s.chip)}">${escapeHtml(s.chip)}</span>` : wrapSeg(content.slice(s.from, s.to), s.marks))).join("");
}

// ---------------------------------------------------------------------------
// Reading a contentEditable block back into content + spans
// ---------------------------------------------------------------------------

type BoolMark = Exclude<keyof RichMark, "link">;

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
    else if (tag === "A") {
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
 * so offsets always line up with `content`.
 */
export function readBlock(el: HTMLElement): { content: string; spans: InlineSpan[] } {
  const root = el;
  const parts: string[] = [];
  const spans: InlineSpan[] = [];
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n: Node) {
      const p = n.parentElement;
      if (p && p.classList.contains("link-chip")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node = walker.nextNode();
  while (node) {
    const text = (node as Text).textContent ?? "";
    if (text.length > 0) {
      const marks = marksFromElement(node.parentElement as Element, root);
      if (hasMarks(marks)) {
        spans.push({ from: offset, to: offset + text.length, ...marks });
      }
      parts.push(text);
      offset += text.length;
    }
    node = walker.nextNode();
  }
  return { content: parts.join(""), spans: mergeSpans(spans) };
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
