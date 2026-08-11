/**
 * Schema migration for locally persisted data.
 * The storage layer keeps a schemaVersion per workspace; every read runs
 * through `migrate` so old on-disk data is upgraded in place.
 */
import { SCHEMA_VERSION } from "./types";
import type { Block, Folder, Page, Task, Workspace } from "./types";

const MIGRATIONS: Array<(d: unknown) => unknown> = [
  // v0 -> v1: initial release schema. No-op placeholder that records intent.
  function toV1(d: unknown) {
    return d;
  },
  // v1 -> v2: folders edition. Pages/files gained a folderId, blocks gained
  // the "math" type, and marks gained highlight. All additive — no reshaping.
  function toV2(d: unknown) {
    return d;
  },
];

export function migrateWorkspace(workspace: Workspace): Workspace {
  let current: Workspace = { ...workspace };
  let v = current.schemaVersion ?? 0;
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) break;
    current = { ...(step(current) as Workspace), schemaVersion: v + 1 };
    v += 1;
  }
  return current;
}

export function migratePages(pages: Page[]): Page[] {
  return pages.map((p) => ({
    ...p,
    favorite: Boolean(p.favorite),
    parentId: p.parentId ?? null,
    folderId: typeof p.folderId === "string" && p.folderId ? p.folderId : null,
    icon: typeof p.icon === "string" ? p.icon : "",
    title: typeof p.title === "string" ? p.title : "",
    order: typeof p.order === "number" ? p.order : p.createdAt,
  }));
}

export function migrateFolders(folders: Folder[]): Folder[] {
  return folders.map((f) => ({
    ...f,
    parentId: f.parentId ?? null,
    icon: typeof f.icon === "string" ? f.icon : "",
    name: typeof f.name === "string" ? f.name : "New folder",
    order: typeof f.order === "number" ? f.order : f.createdAt,
  }));
}

export function migrateBlocks(blocks: Block[]): Block[] {
  return blocks.map((b) => ({
    ...b,
    content: typeof b.content === "string" ? b.content : "",
    checked: Boolean(b.checked),
    indent: Number(b.indent) || 0,
    attachmentId: b.attachmentId ?? null,
    rows: Array.isArray(b.rows) ? b.rows : [],
    order: typeof b.order === "number" ? b.order : b.createdAt,
  }));
}

export function migrateTasks(tasks: Task[]): Task[] {
  return tasks.map((t) => ({
    ...t,
    completed: Boolean(t.completed),
    priority: [0, 1, 2, 3].includes(t.priority) ? t.priority : 0,
    dueDate: t.dueDate ?? null,
    tags: Array.isArray(t.tags) ? t.tags : [],
    notes: typeof t.notes === "string" ? t.notes : "",
    favorite: Boolean(t.favorite),
  }));
}
