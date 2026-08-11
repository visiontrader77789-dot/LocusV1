/**
 * Page links and backlinks.
 * `[[Page Title]]` in any block content creates a link to the page with that
 * title (case-insensitive). Completely local.
 */
import type { Block, ID, Page } from "./types";
import { collectBlockLinks } from "./rich";

export const LINK_PATTERN = /\[\[([^\[\]]{1,120})\]\]/g;

/** Every unique [[link]] mentioned in a string. */
export function extractLinks(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  LINK_PATTERN.lastIndex = 0;
  while ((m = LINK_PATTERN.exec(text)) !== null) {
    const t = m[1].trim();
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) {
      out.push(t);
    }
  }
  return out;
}

/** Render a raw block string with [[links]] replaced by tokens for display. */
export function renderLinks(text: string): Array<{ text: string; link?: string }> {
  const parts: Array<{ text: string; link?: string }> = [];
  let last = 0;
  LINK_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_PATTERN.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[1].trim(), link: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  if (parts.length === 0) parts.push({ text });
  return parts;
}

export interface BacklinkRef {
  pageId: ID;
  blockId: ID;
  snippet: string;
}

/**
 * Compute backlinks for a target page from all blocks.
 * A block linking to targetTitle (case-insensitive) is a backlink.
 */
export function computeBacklinks(
  target: Page,
  pages: Page[],
  blocksByPage: Map<ID, Block[]>,
): BacklinkRef[] {
  const targetTitle = target.title.toLowerCase();
  const out: BacklinkRef[] = [];
  for (const page of pages) {
    if (page.id === target.id) continue;
    const blocks = blocksByPage.get(page.id) ?? [];
    for (const block of blocks) {
      const title = page.title.toLowerCase();
      const mentions = findTitleMentions(block, targetTitle, title);
      if (mentions.length > 0) {
        out.push({ pageId: page.id, blockId: block.id, snippet: mentions[0] });
      }
    }
  }
  return out;
}

function findTitleMentions(block: Block, targetTitle: string, selfTitle: string): string[] {
  const matches: string[] = [];
  for (const link of collectBlockLinks(block)) {
    if (link.toLowerCase() === targetTitle) {
      matches.push(block.content);
    }
  }
  // A page linking to itself by name is not a backlink.
  if (selfTitle === targetTitle) return [];
  return matches;
}

/** Find all pages referenced from a given page's blocks (outgoing links). */
export function outgoingLinks(page: Page, blocks: Block[], pages: Page[]): Page[] {
  const byTitle = new Map<string, Page>();
  for (const p of pages) byTitle.set(p.title.toLowerCase(), p);
  const seen = new Set<ID>();
  const out: Page[] = [];
  for (const block of blocks) {
    for (const link of collectBlockLinks(block)) {
      const hit = byTitle.get(link.toLowerCase());
      if (hit && !seen.has(hit.id)) {
        seen.add(hit.id);
        out.push(hit);
      }
    }
  }
  return out;
}

/** Backlink-aware rename: update [[old]] links to the new title across blocks. */
export function renameLinksInBlocks(blocks: Block[], oldTitle: string, newTitle: string): Block[] {
  if (!oldTitle || oldTitle === newTitle) return blocks;
  const pattern = new RegExp(
    `\\[\\[${oldTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\]`,
    "gi",
  );
  let changed = false;
  const next = blocks.map((b) => {
    let content = b.content;
    let rich = b.rich;
    if (pattern.test(content)) {
      changed = true;
      content = content.replace(pattern, `[[${newTitle}]]`);
    }
    if (rich && rich.some((s) => s.link && s.link.toLowerCase() === oldTitle.toLowerCase())) {
      changed = true;
      rich = rich.map((s) =>
        s.link && s.link.toLowerCase() === oldTitle.toLowerCase() ? { ...s, link: newTitle } : s,
      );
    }
    if (!changed) return b;
    return { ...b, content, rich };
  });
  return changed ? next : blocks;
}
