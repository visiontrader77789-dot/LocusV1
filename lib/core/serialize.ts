/**
 * .locus workspace archive: export, parse, validate.
 *
 * A .locus file is a single JSON document containing the whole workspace:
 * workspace metadata, settings, pages, blocks, tasks, file metadata, and file
 * bytes where feasible. It is a portable, importable backup format that the
 * future native Locus apps can read unchanged.
 *
 * Imported files are treated as untrusted input: everything is validated and
 * sanitized, and nothing is executed. The validators live in validate.ts and
 * are shared with the normal storage load path.
 */
import type {
  Block,
  FileRef,
  Folder,
  Page,
  Settings,
  Task,
  Workspace,
  LocusFileEntry,
} from "./types";
import { SCHEMA_VERSION } from "./types";
import {
  dedupeById,
  isRecord,
  num,
  repairRelationships,
  resolveFolderId,
  validateBlock,
  validateFile,
  validateFolder,
  validatePage,
  validateSettings,
  validateTask,
  validateWorkspaceMeta,
} from "./validate";
import { migrateBlocks, migrateFolders, migratePages, migrateTasks, migrateWorkspace } from "./migration";

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
  folders: Folder[];
}

export interface ExportInput {
  workspace: Workspace;
  settings: Settings;
  pages: Page[];
  blocks: Block[];
  tasks: Task[];
  files: FileRef[];
  folders: Folder[];
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
    folders: input.folders,
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

/**
 * Parse and validate a .locus document. Never throws on malformed input —
 * returns errors instead.
 *
 * With `allowEmpty: true` (used by automatic snapshots) an empty workspace is
 * valid — the user may legitimately have deleted all content. Interactive
 * imports keep the stricter "this backup is empty" rejection.
 */
export function parseLocusText(text: string, options?: { allowEmpty?: boolean }): ImportResult {
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
  const workspace = validateWorkspaceMeta(workspaceRaw);
  if (!workspace) {
    return { ok: false, errors: ["This backup has no workspace."], warnings };
  }
  const migratedWs = migrateWorkspace(workspace);

  const settingsRaw = isRecord(raw.settings) ? raw.settings : {};
  const settings = validateSettings(settingsRaw, migratedWs.id) ?? {
    id: "settings",
    workspaceId: migratedWs.id,
    theme: "system" as const,
    editorFontSize: 16,
    editorSpacing: "comfortable" as const,
    coverPreset: "patina" as const,
    coverTitle: "",
    coverSubtitle: "",
  };

  const pagesRaw = Array.isArray(raw.pages) ? raw.pages : [];
  const pages: Page[] = [];
  for (const p of pagesRaw) {
    const page = validatePage(p, errors);
    if (page) pages.push(page);
  }

  const foldersRaw = Array.isArray(raw.folders) ? raw.folders : [];
  const folders: Folder[] = [];
  for (const fo of foldersRaw) {
    const folder = validateFolder(fo, errors);
    if (folder) folders.push(folder);
  }

  // Repair structural issues (duplicate ids, parent cycles, orphan links)
  // before resolving references — same guarantees as the normal load path.
  repairRelationships(pages, folders);
  dedupeById(folders);
  const pageIds = new Set(pages.map((p) => p.id));

  const blocksRaw = Array.isArray(raw.blocks) ? raw.blocks : [];
  const blocks: Block[] = [];
  for (const b of blocksRaw) {
    const block = validateBlock(b, errors);
    if (block && pageIds.has(block.pageId)) blocks.push(block);
  }
  dedupeById(blocks);

  const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
  const tasks: Task[] = [];
  for (const t of tasksRaw) {
    const task = validateTask(t, errors);
    if (task) tasks.push(task);
  }
  dedupeById(tasks);

  const filesRaw = Array.isArray(raw.files) ? raw.files : [];
  const files: LocusFileEntry[] = [];
  for (const f of filesRaw) {
    const file = validateFile(f, errors);
    if (file) files.push(file);
  }
  dedupeById(files);

  // Resolve folder memberships: drop references to unknown folders and break
  // any remaining folder cycles.
  for (const p of pages) {
    p.folderId = resolveFolderId(p.folderId, folders);
  }
  for (const f of files) {
    f.folderId = resolveFolderId(f.folderId, folders);
  }

  const migratedPages = migratePages(pages);
  const migratedBlocks = migrateBlocks(blocks);
  const migratedTasks = migrateTasks(tasks);
  const migratedFolders = migrateFolders(folders);

  if (!options?.allowEmpty && pages.length === 0 && migratedTasks.length === 0 && files.length === 0 && migratedFolders.length === 0) {
    errors.push("This backup is empty.");
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
    folders: migratedFolders,
  };

  return { ok: errors.length === 0, errors, warnings, data };
}

export function decodeBase64File(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
