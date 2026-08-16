/**
 * Sanitize workspace data read from local storage before it reaches the UI.
 *
 * The primary rows in IndexedDB are validated exactly like a .locus import:
 * shapes are coerced, unknown block types are dropped, duplicate ids are
 * re-keyed (nothing is deleted), parent cycles are broken, and orphaned
 * references are detached. Any repair is reported back so the app can tell
 * the user the data needed care.
 */
import type { Block, FileRef, Folder, Page, Settings, Task, Workspace } from "./types";
import { defaultSettings } from "./types";
import {
  dedupeById,
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

export interface RawWorkspaceData {
  workspace: unknown;
  pages: unknown;
  blocks: unknown;
  tasks: unknown;
  files: unknown;
  folders: unknown;
  settings: unknown;
}

export interface SanitizedWorkspaceData {
  workspace: Workspace | null;
  pages: Page[];
  blocks: Block[];
  tasks: Task[];
  files: FileRef[];
  folders: Folder[];
  settings: Settings;
}

export interface SanitizeResult {
  data: SanitizedWorkspaceData;
  /** Human-readable notes about any data that was repaired or dropped. */
  issues: string[];
}

function isList(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function sanitizeLoadedData(raw: Partial<RawWorkspaceData>): SanitizeResult {
  const issues: string[] = [];

  const workspaceRaw = raw.workspace;
  const workspace =
    validateWorkspaceMeta(workspaceRaw === undefined ? null : workspaceRaw);
  const migratedWs = workspace ? migrateWorkspace(workspace) : null;

  const settingsRaw = raw.settings;
  const settings =
    validateSettings(settingsRaw === undefined ? null : settingsRaw, migratedWs?.id ?? "main") ??
    defaultSettings(migratedWs?.id ?? "main");

  const pages: Page[] = [];
  for (const p of isList(raw.pages)) {
    const page = validatePage(p, issues);
    if (page) pages.push(page);
  }

  const folders: Folder[] = [];
  for (const f of isList(raw.folders)) {
    const folder = validateFolder(f, issues);
    if (folder) folders.push(folder);
  }

  const repair = repairRelationships(pages, folders);
  if (repair.reIded > 0) issues.push(`Re-keyed ${repair.reIded} duplicate ids.`);
  if (repair.cyclesBroken > 0) issues.push(`Broke ${repair.cyclesBroken} parent cycle${repair.cyclesBroken === 1 ? "" : "s"}.`);
  if (repair.orphansParented > 0) issues.push(`Detached ${repair.orphansParented} orphaned reference${repair.orphansParented === 1 ? "" : "s"}.`);

  const pageIds = new Set(pages.map((p) => p.id));

  const blocks: Block[] = [];
  for (const b of isList(raw.blocks)) {
    const block = validateBlock(b, issues);
    // Blocks that point at a page we no longer have are kept but unreachable;
    // the primary data is never thrown away by the load pipeline.
    if (block && pageIds.has(block.pageId)) blocks.push(block);
  }
  const blockDups = dedupeById(blocks);
  if (blockDups > 0) issues.push(`Re-keyed ${blockDups} duplicate block ids.`);

  const tasks: Task[] = [];
  for (const t of isList(raw.tasks)) {
    const task = validateTask(t, issues);
    if (task) tasks.push(task);
  }
  const taskDups = dedupeById(tasks);
  if (taskDups > 0) issues.push(`Re-keyed ${taskDups} duplicate task ids.`);

  const files: FileRef[] = [];
  for (const f of isList(raw.files)) {
    const file = validateFile(f, issues);
    if (file) {
      const { data: _data, ...ref } = file;
      files.push(ref);
    }
  }
  const fileDups = dedupeById(files);
  if (fileDups > 0) issues.push(`Re-keyed ${fileDups} duplicate file ids.`);

  for (const p of pages) p.folderId = resolveFolderId(p.folderId, folders);
  for (const f of files) f.folderId = resolveFolderId(f.folderId, folders);

  return {
    data: {
      workspace: migratedWs,
      pages: migratePages(pages),
      blocks: migrateBlocks(blocks),
      tasks: migrateTasks(tasks),
      files,
      folders: migrateFolders(folders),
      settings,
    },
    issues,
  };
}
