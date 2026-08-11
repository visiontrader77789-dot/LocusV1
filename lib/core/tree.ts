/**
 * Page tree helpers. Platform-independent.
 * Hierarchy is stored as parentId links; these functions derive the tree,
 * paths, ancestry, and re-parenting operations used by the sidebar and dnd.
 */
import type { Folder, ID, Page, PageTreeNode, FolderTreeNode, WorkspaceNode } from "./types";

export function sortPages(pages: Page[]): Page[] {
  // Siblings keep a stable order key; fall back to creation time.
  return [...pages].sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt) || a.id.localeCompare(b.id));
}

export function sortFolders(folders: Folder[]): Folder[] {
  return [...folders].sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt) || a.id.localeCompare(b.id));
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

/** Build a nested tree from a flat folder list. */
export function buildFolderTree(folders: Folder[]): FolderTreeNode[] {
  const byId = new Map<ID, FolderTreeNode>();
  for (const f of folders) byId.set(f.id, { folder: f, children: [] });
  const roots: FolderTreeNode[] = [];
  const sorted = sortFolders(folders);
  for (const f of sorted) {
    const node = byId.get(f.id)!;
    if (f.parentId && byId.has(f.parentId)) {
      byId.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/**
 * Build the combined workspace tree: folders and pages share one hierarchy.
 * Pages nested under a page stay under that page; pages with no parent live in
 * their folder (or the workspace root). Within a level, folders render first,
 * then pages, each in `order`.
 */
export function buildWorkspaceTree(pages: Page[], folders: Folder[]): WorkspaceNode[] {
  const pageIds = new Set(pages.map((p) => p.id));
  const byParent = new Map<ID, Page[]>();
  const byFolder = new Map<ID | null, Page[]>();
  for (const p of pages) {
    if (p.parentId && pageIds.has(p.parentId)) {
      const list = byParent.get(p.parentId);
      if (list) list.push(p);
      else byParent.set(p.parentId, [p]);
    } else {
      const list = byFolder.get(p.folderId);
      if (list) list.push(p);
      else byFolder.set(p.folderId, [p]);
    }
  }
  const foldersByParent = new Map<ID | null, Folder[]>();
  for (const f of folders) {
    const list = foldersByParent.get(f.parentId);
    if (list) list.push(f);
    else foldersByParent.set(f.parentId, [f]);
  }

  const pageNode = (p: Page): WorkspaceNode => ({
    kind: "page",
    page: p,
    children: sortPages(byParent.get(p.id) ?? []).map(pageNode),
  });

  const folderNode = (f: Folder): WorkspaceNode => ({
    kind: "folder",
    folder: f,
    children: [
      ...sortFolders(foldersByParent.get(f.id) ?? []).map(folderNode),
      ...sortPages(byFolder.get(f.id) ?? []).map(pageNode),
    ],
  });

  return [
    ...sortFolders(foldersByParent.get(null) ?? []).map(folderNode),
    ...sortPages(byFolder.get(null) ?? []).map(pageNode),
  ];
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

/** All descendant folder ids of a folder (including itself when includeSelf). */
export function collectFolderDescendants(folderId: ID, folders: Folder[], includeSelf = true): ID[] {
  const out: ID[] = includeSelf ? [folderId] : [];
  const children = folders.filter((f) => f.parentId === folderId);
  for (const c of children) {
    out.push(...collectFolderDescendants(c.id, folders, true));
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

/** Folder ancestors from root-most to the folder itself. */
export function folderAncestry(folderId: ID, folders: Folder[]): Folder[] {
  const map = new Map(folders.map((f) => [f.id, f]));
  const chain: Folder[] = [];
  let cur: Folder | undefined = map.get(folderId);
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
  /** Folder to place the page in. Undefined keeps/inherits the current one. */
  folderId?: ID | null;
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
  folderId?: ID | null,
): { pageId: ID; parentId: ID | null; beforeId?: ID; folderId?: ID | null } | null {
  if (newParentId === pageId) return null;
  if (newParentId && collectDescendants(pageId, pages, true).includes(newParentId)) {
    return null;
  }
  if (beforeId === pageId) return null;
  return { pageId, parentId: newParentId, beforeId, folderId };
}

/** Apply a move to a flat list, respecting beforeId ordering. */
export function applyMove(
  pages: Page[],
  move: { pageId: ID; parentId: ID | null; beforeId?: ID; folderId?: ID | null },
): Page[] {
  const target = pages.find((p) => p.id === move.pageId);
  if (!target) return pages;
  const next = pages.filter((p) => p.id !== move.pageId);
  const moved: Page = {
    ...target,
    parentId: move.parentId,
    folderId: move.folderId !== undefined ? move.folderId : target.folderId,
    updatedAt: Date.now(),
  };

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

export interface FolderMoveTarget {
  parentId: ID | null;
  beforeId?: ID;
}

/** Cycle-guarded move for folders. Folders nest only inside other folders. */
export function planFolderMove(
  folderId: ID,
  folders: Folder[],
  newParentId: ID | null,
  beforeId?: ID,
): FolderMoveTarget | null {
  if (newParentId === folderId) return null;
  if (newParentId && collectFolderDescendants(folderId, folders, true).includes(newParentId)) {
    return null;
  }
  if (beforeId === folderId) return null;
  return { parentId: newParentId, beforeId };
}

/** Apply a folder move to a flat list, respecting beforeId ordering. */
export function applyFolderMove(folders: Folder[], move: FolderMoveTarget & { folderId: ID }): Folder[] {
  const target = folders.find((f) => f.id === move.folderId);
  if (!target) return folders;
  const next = folders.filter((f) => f.id !== move.folderId);
  const moved: Folder = { ...target, parentId: move.parentId, updatedAt: Date.now() };

  const siblings = sortFolders(next.filter((f) => f.parentId === move.parentId));
  let idx = siblings.length;
  if (move.beforeId) {
    const i = siblings.findIndex((s) => s.id === move.beforeId);
    if (i >= 0) idx = i;
  }
  siblings.splice(idx, 0, moved);

  const renumbered = siblings.map((s, i) => ({ ...s, order: i }));
  const rest = next.filter((f) => f.parentId !== move.parentId);
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
