/**
 * Typed repositories over a StorageBackend.
 *
 * Each entity has its own store module (workspaceStore, pageStore, blockStore,
 * taskStore, fileStore, settingsStore) exposed as methods on a single
 * Repository class. Components never touch the backend directly — they use
 * these repositories through the app store.
 */
import type { StorageBackend, TransactOp } from "./backend";
import type {
  Block,
  FileRef,
  Folder,
  Page,
  Settings,
  Task,
  Workspace,
} from "@/lib/core/types";
import { defaultSettings } from "@/lib/core/types";

const T_WORKSPACE = "ws";
const T_PAGES = "pages";
const T_BLOCKS = "blocks";
const T_TASKS = "tasks";
const T_FILES = "files";
const T_FOLDERS = "folders";
const T_SETTINGS = "settings";

const WORKSPACE_KEY = "main";
const SNAPSHOT_KEY = "snapshot";

/** Everything needed to persist a complete workspace state. */
export interface WorkspaceBundle {
  workspace: Workspace;
  pages: Page[];
  blocks: Block[];
  tasks: Task[];
  files: FileRef[];
  folders: Folder[];
  settings: Settings;
}

export class Repository {
  constructor(readonly backend: StorageBackend) {}

  // ---- workspaceStore ----
  async getWorkspace(): Promise<Workspace | null> {
    return this.backend.get<Workspace>(T_WORKSPACE, WORKSPACE_KEY);
  }
  async saveWorkspace(ws: Workspace): Promise<void> {
    await this.backend.put(T_WORKSPACE, WORKSPACE_KEY, ws);
  }

  // ---- pageStore ----
  async getPages(): Promise<Page[]> {
    return this.backend.getAll<Page>(T_PAGES);
  }
  async getPage(id: string): Promise<Page | null> {
    return this.backend.get<Page>(T_PAGES, id);
  }
  async savePage(page: Page): Promise<void> {
    await this.backend.put(T_PAGES, page.id, page);
  }
  async savePages(pages: Page[]): Promise<void> {
    await this.backend.putAll(T_PAGES, pages.map((p) => [p.id, p]));
  }
  async deletePage(id: string): Promise<void> {
    await this.backend.delete(T_PAGES, id);
  }

  // ---- blockStore ----
  async getBlocksForPage(pageId: string): Promise<Block[]> {
    const all = await this.backend.getAll<Block>(T_BLOCKS);
    return all.filter((b) => b.pageId === pageId);
  }
  async getAllBlocks(): Promise<Block[]> {
    return this.backend.getAll<Block>(T_BLOCKS);
  }
  async saveBlocks(blocks: Block[]): Promise<void> {
    await this.backend.putAll(T_BLOCKS, blocks.map((b) => [b.id, b]));
  }
  async deleteBlock(id: string): Promise<void> {
    await this.backend.delete(T_BLOCKS, id);
  }
  async deleteBlocksForPages(pageIds: string[]): Promise<void> {
    const all = await this.getAllBlocks();
    const doomed = all.filter((b) => pageIds.includes(b.pageId));
    await this.backend.putAll(
      T_BLOCKS,
      all.filter((b) => !doomed.includes(b)).map((b) => [b.id, b]),
    );
  }

  // ---- taskStore ----
  async getTasks(): Promise<Task[]> {
    return this.backend.getAll<Task>(T_TASKS);
  }
  async saveTask(task: Task): Promise<void> {
    await this.backend.put(T_TASKS, task.id, task);
  }
  async saveTasks(tasks: Task[]): Promise<void> {
    await this.backend.putAll(T_TASKS, tasks.map((t) => [t.id, t]));
  }
  async deleteTask(id: string): Promise<void> {
    await this.backend.delete(T_TASKS, id);
  }

  // ---- fileStore ----
  async getFiles(): Promise<FileRef[]> {
    return this.backend.getAll<FileRef>(T_FILES);
  }
  async saveFile(file: FileRef): Promise<void> {
    await this.backend.put(T_FILES, file.id, file);
  }
  async saveFiles(files: FileRef[]): Promise<void> {
    await this.backend.putAll(T_FILES, files.map((f) => [f.id, f]));
  }
  async deleteFile(id: string): Promise<void> {
    await this.backend.delete(T_FILES, id);
  }
  async getFileBlob(file: FileRef): Promise<Blob | null> {
    return this.backend.getBlob(file.blobKey);
  }
  async saveFileBlob(blobKey: string, blob: Blob): Promise<void> {
    await this.backend.putBlob(blobKey, blob);
  }
  async deleteFileBlob(blobKey: string): Promise<void> {
    await this.backend.deleteBlob(blobKey);
  }

  // ---- folderStore ----
  async getFolders(): Promise<Folder[]> {
    return this.backend.getAll<Folder>(T_FOLDERS);
  }
  async saveFolder(folder: Folder): Promise<void> {
    await this.backend.put(T_FOLDERS, folder.id, folder);
  }
  async saveFolders(folders: Folder[]): Promise<void> {
    await this.backend.putAll(T_FOLDERS, folders.map((f) => [f.id, f]));
  }
  async deleteFolder(id: string): Promise<void> {
    await this.backend.delete(T_FOLDERS, id);
  }

  // ---- settingsStore ----
  async getSettings(): Promise<Settings> {
    const s = await this.backend.get<Settings>(T_SETTINGS, "settings");
    if (s) return s;
    const ws = await this.getWorkspace();
    const fresh = defaultSettings(ws?.id ?? "main");
    await this.backend.put(T_SETTINGS, "settings", fresh);
    return fresh;
  }
  async saveSettings(settings: Settings): Promise<void> {
    await this.backend.put(T_SETTINGS, "settings", settings);
  }

  // ---- snapshot / backup ----
  async getSnapshot(): Promise<string | null> {
    return this.backend.get<string>(T_WORKSPACE, SNAPSHOT_KEY);
  }
  async saveSnapshot(text: string): Promise<void> {
    await this.backend.put(T_WORKSPACE, SNAPSHOT_KEY, text);
  }

  // ---- lifecycle ----
  /**
   * Atomically replace the entire workspace: clear every row store and the
   * blob store, then write the new rows in one transaction. A failure leaves
   * the previous workspace fully intact — nothing is pre-cleared.
   */
  async replaceWorkspace(bundle: WorkspaceBundle): Promise<void> {
    const ops: TransactOp[] = [
      { op: "clearTable", table: T_PAGES },
      { op: "clearTable", table: T_BLOCKS },
      { op: "clearTable", table: T_TASKS },
      { op: "clearTable", table: T_FILES },
      { op: "clearTable", table: T_FOLDERS },
      { op: "clearTable", table: T_SETTINGS },
      { op: "clearTable", table: T_WORKSPACE },
      { op: "clearBlobs" },
    ];
    const addRows = <T>(table: string, rows: Array<[string, T]>) => {
      for (const [key, value] of rows) ops.push({ op: "put", table, key, value });
    };
    addRows(T_WORKSPACE, [[WORKSPACE_KEY, bundle.workspace]]);
    addRows(T_SETTINGS, [["settings", bundle.settings]]);
    addRows(T_PAGES, bundle.pages.map((p) => [p.id, p]));
    addRows(T_BLOCKS, bundle.blocks.map((b) => [b.id, b]));
    addRows(T_TASKS, bundle.tasks.map((t) => [t.id, t]));
    addRows(T_FILES, bundle.files.map((f) => [f.id, f]));
    addRows(T_FOLDERS, bundle.folders.map((f) => [f.id, f]));
    await this.backend.transact(ops);
  }

  /** Atomically remove every record (used by reset). */
  async clearWorkspace(): Promise<void> {
    await this.backend.transact([
      { op: "clearTable", table: T_PAGES },
      { op: "clearTable", table: T_BLOCKS },
      { op: "clearTable", table: T_TASKS },
      { op: "clearTable", table: T_FILES },
      { op: "clearTable", table: T_FOLDERS },
      { op: "clearTable", table: T_SETTINGS },
      { op: "clearTable", table: T_WORKSPACE },
      { op: "clearBlobs" },
    ]);
  }

  async estimateUsage(): Promise<{ usage: number; quota: number }> {
    return this.backend.estimate();
  }
}
