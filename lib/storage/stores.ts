/**
 * Typed repositories over a StorageBackend.
 *
 * Each entity has its own store module (workspaceStore, pageStore, blockStore,
 * taskStore, fileStore, settingsStore) exposed as methods on a single
 * Repository class. Components never touch the backend directly — they use
 * these repositories through the app store.
 */
import type { StorageBackend } from "./backend";
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

  // ---- lifecycle ----
  /** Remove every record for a workspace (used by reset / re-import). */
  async clearWorkspace(): Promise<void> {
    await Promise.all([
      this.backend.clear(T_PAGES),
      this.backend.clear(T_BLOCKS),
      this.backend.clear(T_TASKS),
      this.backend.clear(T_FILES),
      this.backend.clear(T_FOLDERS),
      this.backend.clear(T_SETTINGS),
      this.backend.clear(T_WORKSPACE),
    ]);
    // Blobs: cleared individually during file deletion; purge any orphaned ones
    // by rewriting the blob store. We keep the blob store intact here because
    // clear() would drop the store schema. Instead we rely on deleteFile paths.
  }

  async estimateUsage(): Promise<{ usage: number; quota: number }> {
    return this.backend.estimate();
  }
}
