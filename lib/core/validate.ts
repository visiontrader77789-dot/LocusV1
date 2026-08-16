/**
 * Runtime validation and integrity repair for Locus data.
 *
 * Data loaded from IndexedDB is treated as untrusted input, just like a .locus
 * import: every entity passes through a sanitizing validator before it reaches
 * the UI, and `repairRelationships` fixes structural issues (duplicate ids,
 * parent cycles, orphan links) without destroying content.
 *
 * The validators live here and are shared by the export/import code
 * (serialize.ts) and by the normal load path (app store).
 */
import type {
  Block,
  BlockType,
  CalloutType,
  FileRef,
  Folder,
  InlineSpan,
  LocusFileEntry,
  Page,
  Settings,
  Task,
  Workspace,
} from "./types";
import { CALLOUT_TYPES, SCHEMA_VERSION } from "./types";
import { uid } from "./util";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function str(v: unknown, def = ""): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "") : def;
}

export function num(v: unknown, def = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

export function bool(v: unknown): boolean {
  return v === true;
}

export function idStr(v: unknown, fallback: () => string): string {
  return typeof v === "string" && v.length > 0 && v.length <= 128 ? v : fallback();
}

export const BLOCK_TYPES = new Set<string>([
  "paragraph", "heading1", "heading2", "heading3", "bulletList",
  "numberedList", "todoList", "quote", "code", "divider", "image",
  "file", "table", "math", "callout", "toggle",
]);

export const HIGHLIGHT_COLORS = new Set(["yellow", "green", "pink", "blue", "orange", "purple"]);
export const FILE_KINDS = new Set(["image", "document", "audio", "video", "archive", "other"]);
export const THEMES = new Set(["light", "dark", "system"]);
export const SPACINGS = new Set(["compact", "comfortable"]);
export const COVER_PRESETS = new Set(["patina", "ink", "dusk", "clay", "bark", "paper"]);

export function validateWorkspaceMeta(v: unknown): Workspace | null {
  if (!isRecord(v)) return null;
  return {
    id: idStr(v.id, () => "main"),
    name: str(v.name, "Workspace").slice(0, 256) || "Workspace",
    createdAt: num(v.createdAt),
    updatedAt: num(v.updatedAt),
    schemaVersion: Math.max(0, Math.round(num(v.schemaVersion, SCHEMA_VERSION))),
  };
}

export function validateSettings(v: unknown, workspaceId: string): Settings | null {
  if (!isRecord(v)) return null;
  const theme = str(v.theme, "system");
  const spacing = str(v.editorSpacing, "comfortable");
  const cover = str(v.coverPreset, "patina");
  return {
    id: "settings",
    workspaceId,
    theme: THEMES.has(theme) ? (theme as Settings["theme"]) : "system",
    editorFontSize: Math.min(22, Math.max(12, Math.round(num(v.editorFontSize, 16)))),
    editorSpacing: SPACINGS.has(spacing) ? (spacing as Settings["editorSpacing"]) : "comfortable",
    coverPreset: COVER_PRESETS.has(cover) ? (cover as Settings["coverPreset"]) : "patina",
    coverTitle: str(v.coverTitle, "").slice(0, 120),
    coverSubtitle: str(v.coverSubtitle, "").slice(0, 240),
  };
}

export function validatePage(v: unknown, _errors: string[]): Page | null {
  if (!isRecord(v)) return null;
  const id = idStr(v.id, uid);
  const workspaceId = idStr(v.workspaceId, () => "main");
  const parentId = typeof v.parentId === "string" && v.parentId ? v.parentId : null;
  const folderId = typeof v.folderId === "string" && v.folderId ? v.folderId : null;
  return {
    id,
    workspaceId,
    title: str(v.title, "Untitled").slice(0, 512) || "Untitled",
    icon: str(v.icon, "").slice(0, 16),
    parentId,
    folderId,
    order: num(v.order, num(v.createdAt)),
    createdAt: num(v.createdAt),
    updatedAt: num(v.updatedAt),
    favorite: bool(v.favorite),
  };
}

export function validateFolder(v: unknown, _errors: string[]): Folder | null {
  if (!isRecord(v)) return null;
  const id = idStr(v.id, uid);
  const workspaceId = idStr(v.workspaceId, () => "main");
  const parentId = typeof v.parentId === "string" && v.parentId ? v.parentId : null;
  return {
    id,
    workspaceId,
    name: str(v.name, "New folder").slice(0, 256) || "New folder",
    icon: str(v.icon, "").slice(0, 16),
    parentId,
    order: num(v.order, num(v.createdAt)),
    createdAt: num(v.createdAt),
    updatedAt: num(v.updatedAt),
  };
}

function validateSpan(v: unknown, length: number): InlineSpan | null {
  if (!isRecord(v)) return null;
  const from = Math.round(num(v.from, -1));
  const to = Math.round(num(v.to, -1));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  const mark: InlineSpan = {
    from: Math.max(0, Math.min(length, from)),
    to: Math.max(0, Math.min(length, to)),
  };
  const has =
    bool(v.bold) || bool(v.italic) || bool(v.underline) || bool(v.strike) || bool(v.code);
  if (typeof v.link === "string" && v.link.length > 0) {
    mark.link = v.link.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, 512);
  }
  if (typeof v.highlight === "string" && HIGHLIGHT_COLORS.has(v.highlight)) {
    mark.highlight = v.highlight as InlineSpan["highlight"];
  }
  if (!has && !mark.link && !mark.highlight) return null;
  if (mark.to <= mark.from) return null;
  return mark;
}

function sanitizeRich(v: unknown, length: number): InlineSpan[] | undefined {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const spans = v.slice(0, 1200).flatMap((s) => {
    const span = validateSpan(s, length);
    return span ? [span] : [];
  });
  return spans.length > 0 ? spans : undefined;
}

export function validateBlock(v: unknown, errors: string[]): Block | null {
  if (!isRecord(v)) return null;
  const type = str(v.type);
  if (!BLOCK_TYPES.has(type)) {
    errors.push(`Skipped block with unknown type "${type}".`);
    return null;
  }
  const pageId = idStr(v.pageId, uid);
  let rows: string[][] = [];
  if (Array.isArray(v.rows)) {
    rows = v.rows
      .filter((r) => Array.isArray(r))
      .slice(0, 20)
      .map((r) => (r as unknown[]).slice(0, 10).map((c) => str(c, "").slice(0, 400)));
  }
  const content = str(v.content, "").slice(0, 50_000);
  const calloutTypeRaw = str(v.calloutType);
  const language = str(v.language).slice(0, 60);
  return {
    id: idStr(v.id, uid),
    pageId,
    type: type as BlockType,
    content,
    rich: sanitizeRich(v.rich, content.length),
    checked: bool(v.checked),
    attachmentId: typeof v.attachmentId === "string" && v.attachmentId ? v.attachmentId : null,
    indent: Math.max(0, Math.min(10, Math.round(num(v.indent)))),
    rows,
    order: num(v.order, num(v.createdAt)),
    createdAt: num(v.createdAt),
    updatedAt: num(v.updatedAt),
    calloutType: CALLOUT_TYPES.includes(calloutTypeRaw as CalloutType) ? (calloutTypeRaw as CalloutType) : undefined,
    language: language || undefined,
    collapsed: type === "toggle" ? v.collapsed === true : undefined,
  };
}

export function validateTask(v: unknown, _errors: string[]): Task | null {
  if (!isRecord(v)) return null;
  const priority = num(v.priority, 0);
  return {
    id: idStr(v.id, uid),
    workspaceId: idStr(v.workspaceId, () => "main"),
    title: str(v.title, "").slice(0, 2000) || "Untitled",
    notes: str(v.notes, "").slice(0, 50_000),
    completed: bool(v.completed),
    priority: [0, 1, 2, 3].includes(priority) ? (priority as 0 | 1 | 2 | 3) : 0,
    dueDate: typeof v.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.dueDate) ? v.dueDate : null,
    pageId: typeof v.pageId === "string" && v.pageId ? v.pageId : null,
    tags: Array.isArray(v.tags) ? v.tags.map((t) => str(t, "").slice(0, 100)).filter(Boolean).slice(0, 20) : [],
    favorite: bool(v.favorite),
    createdAt: num(v.createdAt),
    updatedAt: num(v.updatedAt),
  };
}

export function validateFile(v: unknown, _errors: string[]): LocusFileEntry | null {
  if (!isRecord(v)) return null;
  const kind = str(v.kind);
  return {
    id: idStr(v.id, uid),
    workspaceId: idStr(v.workspaceId, () => "main"),
    name: str(v.name, "file").slice(0, 512) || "file",
    size: Math.max(0, Math.round(num(v.size))),
    type: str(v.type, "application/octet-stream").slice(0, 200),
    kind: FILE_KINDS.has(kind) ? (kind as FileRef["kind"]) : "other",
    blobKey: idStr(v.blobKey, uid),
    pageId: typeof v.pageId === "string" && v.pageId ? v.pageId : null,
    folderId: typeof v.folderId === "string" && v.folderId ? v.folderId : null,
    favorite: bool(v.favorite),
    createdAt: num(v.createdAt),
    updatedAt: num(v.updatedAt),
    data: typeof v.data === "string" && v.data.length > 0 ? v.data : null,
  };
}

/**
 * Resolve a folderId reference against a folder list: unknown ids and ids
 * that participate in a folder cycle resolve to null.
 */
export function resolveFolderId(id: string | null, folders: Folder[]): string | null {
  if (!id) return null;
  const byId = new Map(folders.map((f) => [f.id, f]));
  if (!byId.has(id)) return null;
  const seen = new Set<string>();
  let cur = id;
  while (cur) {
    if (seen.has(cur)) return null;
    seen.add(cur);
    const f = byId.get(cur);
    if (!f) return null;
    if (!f.parentId || !byId.has(f.parentId)) break;
    cur = f.parentId;
  }
  return id;
}

/** Assign fresh ids to duplicate ids so every row survives (nothing is deleted). */
export function dedupeById<T extends { id: string }>(items: T[]): number {  const seen = new Set<string>();
  let reIded = 0;
  for (const item of items) {
    if (seen.has(item.id)) {
      item.id = uid();
      reIded += 1;
    }
    seen.add(item.id);
  }
  return reIded;
}

export interface RepairReport {
  reIded: number;
  cyclesBroken: number;
  orphansParented: number;
}

/**
 * Fix structural relationship problems in place, preserving all content:
 * - duplicate page/folder ids get fresh ids (later occurrences),
 * - parent cycles (A under B under A) are broken at the first edge found,
 * - parentId links to unknown pages/folders are detached (content stays, the
 *   node simply moves to the root level).
 */
export function repairRelationships(pages: Page[], folders: Folder[]): RepairReport {
  const report: RepairReport = { reIded: 0, cyclesBroken: 0, orphansParented: 0 };

  const pageIds = new Set<string>();
  for (const p of pages) {
    if (pageIds.has(p.id)) {
      p.id = uid();
      report.reIded += 1;
    }
    pageIds.add(p.id);
  }
  const folderIds = new Set<string>();
  for (const f of folders) {
    if (folderIds.has(f.id)) {
      f.id = uid();
      report.reIded += 1;
    }
    folderIds.add(f.id);
  }

  const pageParentOf = new Map(pages.map((p) => [p.id, p.parentId]));
  for (const p of pages) {
    const seen = new Set<string>();
    let cur = p.parentId;
    let cycle = false;
    while (cur) {
      if (cur === p.id || seen.has(cur)) {
        cycle = true;
        break;
      }
      seen.add(cur);
      cur = pageParentOf.get(cur) ?? null;
    }
    if (cycle) {
      p.parentId = null;
      report.cyclesBroken += 1;
    } else if (p.parentId && !pageIds.has(p.parentId)) {
      p.parentId = null;
      report.orphansParented += 1;
    }
  }

  const folderParentOf = new Map(folders.map((f) => [f.id, f.parentId]));
  for (const f of folders) {
    const seen = new Set<string>();
    let cur = f.parentId;
    let cycle = false;
    while (cur) {
      if (cur === f.id || seen.has(cur)) {
        cycle = true;
        break;
      }
      seen.add(cur);
      cur = folderParentOf.get(cur) ?? null;
    }
    if (cycle) {
      f.parentId = null;
      report.cyclesBroken += 1;
    } else if (f.parentId && !folderIds.has(f.parentId)) {
      f.parentId = null;
      report.orphansParented += 1;
    }
  }

  return report;
}
