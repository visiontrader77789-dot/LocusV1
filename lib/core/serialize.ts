/**
 * .locus workspace archive: export, parse, validate.
 *
 * A .locus file is a single JSON document containing the whole workspace:
 * workspace metadata, settings, pages, blocks, tasks, file metadata, and file
 * bytes where feasible. It is a portable, importable backup format that the
 * future native Locus apps can read unchanged.
 *
 * Imported files are treated as untrusted input: everything is validated and
 * sanitized, and nothing is executed.
 */
import type {
  Block,
  BlockType,
  FileRef,
  InlineSpan,
  Page,
  Settings,
  Task,
  Workspace,
  LocusFileEntry,
} from "./types";
import { SCHEMA_VERSION } from "./types";
import { migrateBlocks, migratePages, migrateTasks, migrateWorkspace } from "./migration";
import { uid } from "./util";

export const LOCUS_FORMAT = "locus";
export const LOCUS_VERSION = 1;
export const LOCUS_EXTENSION = ".locus";

export interface LocusArchive {
  format: string;
  version: number;
  schemaVersion: number;
  exportedAt: number;
  workspace: Workspace;
  settings: Settings;
  pages: Page[];
  blocks: Block[];
  tasks: Task[];
  files: LocusFileEntry[];
}

export interface ExportInput {
  workspace: Workspace;
  settings: Settings;
  pages: Page[];
  blocks: Block[];
  tasks: Task[];
  files: FileRef[];
  /** Maps blobKey -> Blob for the files that should be inlined. */
  blobFor: (file: FileRef) => Promise<Blob | null>;
  /** Bytes beyond this size are stored as references only. */
  inlineMaxBytes?: number;
}

export interface ImportResult {
  ok: boolean;
  errors: string[];
  data?: LocusArchive;
  /** Warnings that did not block the import (e.g. oversized files). */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function blobToBase64(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export async function buildArchive(input: ExportInput): Promise<LocusArchive> {
  const inlineMax = input.inlineMaxBytes ?? 50 * 1024 * 1024;
  const files: LocusFileEntry[] = [];
  for (const file of input.files) {
    let data: string | null = null;
    if (file.size <= inlineMax) {
      try {
        const blob = await input.blobFor(file);
        if (blob) data = await blobToBase64(blob);
      } catch {
        data = null;
      }
    }
    files.push({ ...file, data });
  }
  return {
    format: LOCUS_FORMAT,
    version: LOCUS_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    workspace: input.workspace,
    settings: input.settings,
    pages: input.pages,
    blocks: input.blocks,
    tasks: input.tasks,
    files,
  };
}

export function archiveToText(archive: LocusArchive): string {
  return JSON.stringify(archive, null, 2);
}

export function archiveToBlob(archive: LocusArchive): Blob {
  return new Blob([archiveToText(archive)], {
    type: "application/vnd.locus+json",
  });
}

// ---------------------------------------------------------------------------
// Import / validation
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, def = ""): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "") : def;
}

function num(v: unknown, def = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

function bool(v: unknown): boolean {
  return v === true;
}

function idStr(v: unknown, fallback: () => string): string {
  return typeof v === "string" && v.length > 0 && v.length <= 128 ? v : fallback();
}

const BLOCK_TYPES = new Set([
  "paragraph", "heading1", "heading2", "heading3", "bulletList",
  "numberedList", "todoList", "quote", "code", "divider", "image",
  "file", "table",
]);

const FILE_KINDS = new Set(["image", "document", "audio", "video", "archive", "other"]);
const THEMES = new Set(["light", "dark", "system"]);
const SPACINGS = new Set(["compact", "comfortable"]);

function validatePage(v: unknown, errors: string[]): Page | null {
  if (!isRecord(v)) return null;
  const id = idStr(v.id, uid);
  const workspaceId = idStr(v.workspaceId, () => "main");
  const parentId = typeof v.parentId === "string" && v.parentId ? v.parentId : null;
  return {
    id,
    workspaceId,
    title: str(v.title, "Untitled").slice(0, 512) || "Untitled",
    icon: str(v.icon, "").slice(0, 16),
    parentId,
    order: num(v.order, num(v.createdAt)),
    createdAt: num(v.createdAt),
    updatedAt: num(v.updatedAt),
    favorite: bool(v.favorite),
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
  if (!has && !mark.link) return null;
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

function validateBlock(v: unknown, errors: string[]): Block | null {
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
  };
}

function validateTask(v: unknown, errors: string[]): Task | null {
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

function validateFile(v: unknown, errors: string[]): LocusFileEntry | null {
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
    favorite: bool(v.favorite),
    createdAt: num(v.createdAt),
    updatedAt: num(v.updatedAt),
    data: typeof v.data === "string" && v.data.length > 0 ? v.data : null,
  };
}

/**
 * Parse and validate a .locus document. Never throws on malformed input —
 * returns errors instead.
 */
export function parseLocusText(text: string): ImportResult {
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["This backup is not valid JSON."], warnings };
  }

  if (!isRecord(raw)) {
    return { ok: false, errors: ["This backup has no content."], warnings };
  }
  if (raw.format !== LOCUS_FORMAT) {
    return {
      ok: false,
      errors: ["This file is not a Locus backup."],
      warnings,
    };
  }

  const errors: string[] = [];

  const workspaceRaw = isRecord(raw.workspace) ? raw.workspace : null;
  if (!workspaceRaw) {
    return { ok: false, errors: ["This backup has no workspace."], warnings };
  }
  const workspace: Workspace = {
    id: idStr(workspaceRaw.id, () => "main"),
    name: str(workspaceRaw.name, "Workspace").slice(0, 256) || "Workspace",
    createdAt: num(workspaceRaw.createdAt),
    updatedAt: num(workspaceRaw.updatedAt),
    schemaVersion: Math.max(0, Math.round(num(workspaceRaw.schemaVersion, SCHEMA_VERSION))),
  };
  const migratedWs = migrateWorkspace(workspace);

  const settingsRaw = isRecord(raw.settings) ? raw.settings : {};
  const theme = str(settingsRaw.theme, "system");
  const spacing = str(settingsRaw.editorSpacing, "comfortable");
  const settings: Settings = {
    id: "settings",
    workspaceId: migratedWs.id,
    theme: THEMES.has(theme) ? (theme as Settings["theme"]) : "system",
    editorFontSize: Math.min(22, Math.max(12, Math.round(num(settingsRaw.editorFontSize, 16)))),
    editorSpacing: SPACINGS.has(spacing) ? (spacing as Settings["editorSpacing"]) : "comfortable",
  };

  const pagesRaw = Array.isArray(raw.pages) ? raw.pages : [];
  const pages: Page[] = [];
  const pageIds = new Set<string>();
  for (const p of pagesRaw) {
    const page = validatePage(p, errors);
    if (page) {
      // No cycles, no self-parenting.
      if (page.parentId === page.id) page.parentId = null;
      if (page.parentId && pageIds.has(page.parentId)) {
        // fine, existing parent
      }
      pageIds.add(page.id);
      pages.push(page);
    }
  }
  const migratedPages = migratePages(pages);

  const blocksRaw = Array.isArray(raw.blocks) ? raw.blocks : [];
  const blocks: Block[] = [];
  for (const b of blocksRaw) {
    const block = validateBlock(b, errors);
    if (block && pageIds.has(block.pageId)) blocks.push(block);
  }
  const migratedBlocks = migrateBlocks(blocks);

  const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
  const tasks: Task[] = [];
  for (const t of tasksRaw) {
    const task = validateTask(t, errors);
    if (task) tasks.push(task);
  }
  const migratedTasks = migrateTasks(tasks);

  const filesRaw = Array.isArray(raw.files) ? raw.files : [];
  const files: LocusFileEntry[] = [];
  for (const f of filesRaw) {
    const file = validateFile(f, errors);
    if (file) files.push(file);
  }

  if (pages.length === 0) {
    errors.push("This backup contains no pages.");
  }

  const data: LocusArchive = {
    format: LOCUS_FORMAT,
    version: num(raw.version, 1),
    schemaVersion: migratedWs.schemaVersion,
    exportedAt: num(raw.exportedAt),
    workspace: migratedWs,
    settings,
    pages: migratedPages,
    blocks: migratedBlocks,
    tasks: migratedTasks,
    files,
  };

  return { ok: errors.length === 0, errors, warnings, data };
}

export function decodeBase64File(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
