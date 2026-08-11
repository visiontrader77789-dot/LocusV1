/**
 * Page tree helpers. Platform-independent.
 * Hierarchy is stored as parentId links; these functions derive the tree,
 * paths, ancestry, and re-parenting operations used by the sidebar and dnd.
 */
import type { ID, Page, PageTreeNode } from "./types";

export function sortPages(pages: Page[]): Page[] {
  // Siblings keep a stable order key; fall back to creation time.
  return [...pages].sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt) || a.id.localeCompare(b.id));
}

/** Build a nested tree from a flat page list. */
export function buildTree(pages: Page[]): PageTreeNode[] {
  const byId = new Map<ID, PageTreeNode>();
  for (const p of pages) byId.set(p.id, { page: p, children: [] });
  const roots: PageTreeNode[] = [];
  const sorted = sortPages(pages);
  for (const p of sorted) {
    const node = byId.get(p.id)!;
    if (p.parentId && byId.has(p.parentId)) {
      byId.get(p.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** All descendant ids of a page (including itself when includeSelf). */
export function collectDescendants(pageId: ID, pages: Page[], includeSelf = true): ID[] {
  const out: ID[] = includeSelf ? [pageId] : [];
  const children = pages.filter((p) => p.parentId === pageId);
  for (const c of children) {
    out.push(...collectDescendants(c.id, pages, true));
  }
  return out;
}

/** Ancestors from root-most to the page itself. */
export function ancestry(pageId: ID, pages: Page[]): Page[] {
  const map = new Map(pages.map((p) => [p.id, p]));
  const chain: Page[] = [];
  let cur: Page | undefined = map.get(pageId);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
  }
  return chain;
}

/** Path segments for the breadcrumb, root-most first. */
export function pathSegments(pageId: ID, pages: Page[]): Page[] {
  return ancestry(pageId, pages);
}

/** Titled path like "Projects / VoiceForge". */
export function pathLabel(pageId: ID, pages: Page[]): string {
  return pathSegments(pageId, pages)
    .map((p) => p.title)
    .join(" / ");
}

export interface MoveTarget {
  parentId: ID | null;
  beforeId?: ID; // insert before this sibling
}

/**
 * Compute the re-parenting needed to move `pageId` under `target`.
 * Guarded against cycles (a page can't become its own descendant).
 */
export function planMove(
  pageId: ID,
  pages: Page[],
  newParentId: ID | null,
  beforeId?: ID,
): { pageId: ID; parentId: ID | null; beforeId?: ID } | null {
  if (newParentId === pageId) return null;
  if (newParentId && collectDescendants(pageId, pages, true).includes(newParentId)) {
    return null;
  }
  if (beforeId === pageId) return null;
  return { pageId, parentId: newParentId, beforeId };
}

/** Apply a move to a flat list, respecting beforeId ordering. */
export function applyMove(pages: Page[], move: { pageId: ID; parentId: ID | null; beforeId?: ID }): Page[] {
  const target = pages.find((p) => p.id === move.pageId);
  if (!target) return pages;
  const next = pages.filter((p) => p.id !== move.pageId);
  const moved: Page = { ...target, parentId: move.parentId, updatedAt: Date.now() };

  const siblings = sortPages(next.filter((p) => p.parentId === move.parentId));
  let idx = siblings.length;
  if (move.beforeId) {
    const i = siblings.findIndex((s) => s.id === move.beforeId);
    if (i >= 0) idx = i;
  }
  siblings.splice(idx, 0, moved);

  const renumbered = siblings.map((s, i) => ({ ...s, order: i }));
  const rest = next.filter((p) => p.parentId !== move.parentId);
  return [...rest, ...renumbered];
}

/** Sanitize a page title for display. */
export function safeTitle(title: string, fallback = "Untitled"): string {
  const t = title.trim().replace(/\s+/g, " ");
  return t.length === 0 ? fallback : t;
}

/** Flattened tree walk order (used for rendering and export ordering). */
export function flattenTree(nodes: PageTreeNode[], depth = 0): { page: Page; depth: number }[] {
  const out: { page: Page; depth: number }[] = [];
  for (const node of nodes) {
    out.push({ page: node.page, depth });
    out.push(...flattenTree(node.children, depth + 1));
  }
  return out;
}
