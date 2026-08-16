"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Block,
  FileRef,
  Folder,
  ID,
  Page,
  Settings,
  Task,
  ThemeSetting,
  Workspace,
} from "@/lib/core/types";
import { WORKSPACE_ID, defaultSettings, emptyWorkspace, newFileRef, newFolder, newPage, newTask } from "@/lib/core/types";
import { seedWorkspace } from "@/lib/core/seed";
import {
  applyFolderMove, applyMove, buildFolderTree, buildTree, collectDescendants,
  collectFolderDescendants, planFolderMove, planMove, safeTitle,
} from "@/lib/core/tree";
import { computeBacklinks, renameLinksInBlocks, type BacklinkRef } from "@/lib/core/backlinks";
import { type LocusArchive, buildArchive, decodeBase64File, parseLocusText, type ImportResult } from "@/lib/core/serialize";
import { buildSnapshot, parseSnapshot } from "@/lib/core/backup";
import { sanitizeLoadedData, type SanitizedWorkspaceData } from "@/lib/core/load";
import { Repository } from "@/lib/storage/stores";
import { IdbBackend, isStorageAvailable } from "@/lib/storage/idb";
import type { StorageBackend } from "@/lib/storage/backend";
import { MemoryBackend } from "@/lib/storage/memory";
import { uid } from "@/lib/core/util";

export type SaveState = "idle" | "saving" | "saved" | "error";
export type NoticeKind = "info" | "success" | "error";
export interface Notice {
  id: string;
  kind: NoticeKind;
  text: string;
}

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export interface FileKindCounts {
  image: number; document: number; audio: number; video: number; archive: number; other: number;
}

/** Debounce for the full-workspace backup snapshot after edits. */
const SNAPSHOT_DEBOUNCE_MS = 2000;

interface AppContextValue {
  ready: boolean;
  fatalError: string | null;
  workspace: Workspace | null;
  pages: Page[];
  tasks: Task[];
  files: FileRef[];
  folders: Folder[];
  blocks: Block[];
  settings: Settings | null;
  saveState: SaveState;

  // derived
  tree: ReturnType<typeof buildTree>;
  folderTree: ReturnType<typeof buildFolderTree>;
  pageById: Map<string, Page>;
  folderById: Map<string, Folder>;
  backlinksForPage: (pageId: ID) => BacklinkRef[];
  recentPages: Page[];
  favorites: { pages: Page[]; tasks: Task[]; files: FileRef[] };

  // workspace
  createWorkspace: (name: string) => Promise<void>;
  renameWorkspace: (name: string) => Promise<void>;
  resetWorkspace: () => Promise<void>;
  exportArchive: () => Promise<LocusArchive>;
  importArchive: (text: string) => Promise<ImportResult>;

  // pages
  createPage: (parentId: ID | null, title?: string, folderId?: ID | null) => Promise<Page>;
  renamePage: (id: ID, title: string) => Promise<void>;
  deletePage: (id: ID) => Promise<void>;
  duplicatePage: (id: ID) => Promise<Page | null>;
  toggleFavoritePage: (id: ID) => Promise<void>;
  setPageIcon: (id: ID, icon: string) => Promise<void>;
  movePage: (id: ID, newParentId: ID | null, beforeId?: ID, folderId?: ID | null) => Promise<void>;
  updatePage: (patch: Partial<Page>) => Promise<void>;

  // folders
  createFolder: (parentId: ID | null) => Promise<Folder>;
  renameFolder: (id: ID, name: string) => Promise<void>;
  setFolderIcon: (id: ID, icon: string) => Promise<void>;
  deleteFolder: (id: ID) => Promise<void>;
  moveFolder: (id: ID, newParentId: ID | null, beforeId?: ID) => Promise<void>;
  moveFile: (id: ID, folderId: ID | null) => Promise<void>;

  // blocks
  blocksForPage: (pageId: ID) => Block[];
  saveBlocks: (pageId: ID, blocks: Block[]) => Promise<void>;

  // tasks
  createTask: (title: string, pageId?: ID | null) => Promise<Task>;
  updateTask: (id: ID, patch: Partial<Task>) => Promise<void>;
  deleteTask: (id: ID) => Promise<void>;
  toggleFavoriteTask: (id: ID) => Promise<void>;

  // files
  addFiles: (files: File[], folderId?: ID | null) => Promise<FileRef[]>;
  renameFile: (id: ID, name: string) => Promise<void>;
  deleteFile: (id: ID) => Promise<void>;
  attachFileToPage: (id: ID, pageId: ID | null) => Promise<void>;
  toggleFavoriteFile: (id: ID) => Promise<void>;
  getFileBlob: (file: FileRef) => Promise<Blob | null>;
  fileKindCounts: FileKindCounts;

  // settings
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  setTheme: (theme: ThemeSetting) => Promise<void>;
  storageUsage: () => Promise<{ usage: number; quota: number }>;

  // ui
  notices: Notice[];
  pushNotice: (kind: NoticeKind, text: string) => void;
  dismissNotice: (id: string) => void;
  confirm: (req: ConfirmRequest) => void;
  confirmState: ConfirmRequest | null;
  closeConfirm: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function makeBackend(): StorageBackend {
  if (isStorageAvailable()) return new IdbBackend();
  return new MemoryBackend();
}

export function AppProvider({ children }: { children: ReactNode }) {
  const backendRef = useRef<StorageBackend | null>(null);
  const [ready, setReady] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<FileRef[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [notices, setNotices] = useState<Notice[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmRequest | null>(null);

  const saveTimer = useRef<number | null>(null);
  const snapshotTimer = useRef<number | null>(null);
  const pendingWrites = useRef(0);
  const tabId = useRef(uid());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const dirtyEntities = useRef<Set<string>>(new Set());

  const repo = useMemo(() => new Repository(backendRef.current ?? makeBackend()), []);

  // Latest snapshot of entity state for the (otherwise stale-closure-prone)
  // background snapshot writer.
  const stateRef = useRef({ workspace, pages, blocks, tasks, files, folders, settings });
  stateRef.current = { workspace, pages, blocks, tasks, files, folders, settings };

  const pushNotice = useCallback((kind: NoticeKind, text: string) => {
    const id = uid();
    setNotices((n) => [...n.slice(-3), { id, kind, text }]);
    window.setTimeout(() => {
      setNotices((n) => n.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  const dismissNotice = useCallback((id: string) => {
    setNotices((n) => n.filter((x) => x.id !== id));
  }, []);

  const confirm = useCallback((req: ConfirmRequest) => {
    setConfirmState(req);
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmState(null);
  }, []);

  const setSave = useCallback((state: SaveState) => {
    setSaveState(state);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (state === "saved" || state === "error") {
      saveTimer.current = window.setTimeout(() => setSaveState("idle"), 2400);
    }
  }, []);

  // Apply theme on every settings change.
  useLayoutEffect(() => {
    if (!settings) return;
    const el = document.documentElement;
    const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    const dark = settings.theme === "dark" || (settings.theme === "system" && systemDark);
    el.dataset.theme = dark ? "dark" : "light";
    if (dark) el.classList.add("dark");
    else el.classList.remove("dark");
    try {
      window.localStorage.setItem("locus:theme", settings.theme);
    } catch {
      // ignore
    }
  }, [settings?.theme, settings]);

  // ---- persistence plumbing -------------------------------------------------

  const markDirty = useCallback((entity: string) => {
    dirtyEntities.current.add(entity);
  }, []);

  const notifySaved = useCallback((entities: string[]) => {
    channelRef.current?.postMessage({ type: "saved", sender: tabId.current, entities });
  }, []);

  const writeSnapshotNow = useCallback(async () => {
    const { workspace, settings, pages, blocks, tasks, files, folders } = stateRef.current;
    if (!workspace || !settings) return;
    try {
      const text = await buildSnapshot({ workspace, settings, pages, blocks, tasks, files, folders });
      await repo.saveSnapshot(text);
    } catch {
      // Backup is best-effort; the primary row writes already succeeded.
    }
  }, [repo]);

  const ensureSnapshot = useCallback(async () => {
    const { workspace, settings, pages, blocks, tasks, files, folders } = stateRef.current;
    if (!workspace || !settings) return;
    try {
      const existing = await repo.getSnapshot();
      if (existing) return;
      const text = await buildSnapshot({ workspace, settings, pages, blocks, tasks, files, folders });
      await repo.saveSnapshot(text);
    } catch {
      // best-effort
    }
  }, [repo]);

  const scheduleSnapshot = useCallback(() => {
    if (snapshotTimer.current) window.clearTimeout(snapshotTimer.current);
    snapshotTimer.current = window.setTimeout(() => {
      snapshotTimer.current = null;
      void writeSnapshotNow();
    }, SNAPSHOT_DEBOUNCE_MS);
  }, [writeSnapshotNow]);

  /**
   * Central save path. Writes through this helper so every mutation gets
   * accurate save-state feedback, cross-tab notifications, a backup snapshot
   * and — crucially — never claims saved when the write failed. On failure the
   * in-memory state is preserved and the user is told the data is still in the
   * tab (the next change will retry). Returns whether the write succeeded.
   */
  const commit = useCallback(
    async (entities: string[], write: () => Promise<void>): Promise<boolean> => {
      pendingWrites.current += 1;
      setSave("saving");
      try {
        await write();
        for (const e of entities) dirtyEntities.current.delete(e);
        pendingWrites.current -= 1;
        if (pendingWrites.current === 0) setSave("saved");
        notifySaved(entities);
        return true;
      } catch {
        pendingWrites.current -= 1;
        setSave("error");
        pushNotice(
          "error",
          "Could not save — your data is still in this tab. Export a backup if this keeps happening.",
        );
        return false;
      } finally {
        scheduleSnapshot();
      }
    },
    [notifySaved, pushNotice, scheduleSnapshot, setSave],
  );

  /** Re-read one entity from storage after another tab changed it. */
  const refetchEntity = useCallback(
    async (entity: string) => {
      const current = stateRef.current;
      switch (entity) {
        case "workspace": {
          const ws = await repo.getWorkspace();
          if (ws) {
            setWorkspace(sanitizeLoadedData({ workspace: ws }).data.workspace);
          } else {
            setWorkspace(null);
            setPages([]);
            setBlocks([]);
            setTasks([]);
            setFiles([]);
            setFolders([]);
            setSettings(null);
          }
          break;
        }
        case "pages":
          setPages(sanitizeLoadedData({ pages: await repo.getPages() }).data.pages);
          break;
        case "blocks":
          setBlocks(sanitizeLoadedData({ blocks: await repo.getAllBlocks(), pages: current.pages }).data.blocks);
          break;
        case "tasks":
          setTasks(sanitizeLoadedData({ tasks: await repo.getTasks() }).data.tasks);
          break;
        case "files":
          setFiles(sanitizeLoadedData({ files: await repo.getFiles(), folders: current.folders }).data.files);
          break;
        case "folders":
          setFolders(sanitizeLoadedData({ folders: await repo.getFolders() }).data.folders);
          break;
        case "settings":
          setSettings(sanitizeLoadedData({ settings: await repo.getSettings() }).data.settings);
          break;
      }
    },
    [repo],
  );

  // Cross-tab coordination: when another tab saves, reconcile entities this
  // tab hasn't locally modified; warn (but keep local data) for dirty ones.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("locus:sync");
    channelRef.current = channel;
    channel.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; sender?: string; entities?: string[] } | null;
      if (!msg || msg.type !== "saved" || msg.sender === tabId.current) return;
      const entities = Array.isArray(msg.entities) ? msg.entities : [];
      const conflicted = entities.filter((ent) => dirtyEntities.current.has(ent));
      if (conflicted.length > 0) {
        pushNotice(
          "error",
          "Another tab changed your workspace — your unsaved edits may overwrite those changes.",
        );
      }
      const clean = entities.filter((ent) => !dirtyEntities.current.has(ent));
      for (const ent of clean) {
        void refetchEntity(ent).catch(() => {});
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [refetchEntity, pushNotice]);

  // Best-effort snapshot on unload / tab hidden.
  useEffect(() => {
    const write = () => void writeSnapshotNow();
    window.addEventListener("pagehide", write);
    const onVis = () => {
      if (document.visibilityState === "hidden") void writeSnapshotNow();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", write);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [writeSnapshotNow]);

  // ---- init ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await repo.backend.init();
      } catch (e) {
        if (!cancelled) {
          setFatalError(e instanceof Error ? e.message : "Local storage is unavailable.");
        }
        return;
      }

      const restoreFromSnapshot = async (): Promise<SanitizedWorkspaceData | null> => {
        const snap = await repo.getSnapshot();
        const archive = snap ? parseSnapshot(snap) : null;
        if (!archive) return null;
        return {
          workspace: archive.workspace,
          pages: archive.pages,
          blocks: archive.blocks,
          tasks: archive.tasks,
          files: archive.files.map(({ data: _d, ...ref }) => ref),
          folders: archive.folders,
          settings: archive.settings,
        };
      };

      let loaded: SanitizedWorkspaceData | null = null;
      let issues: string[] = [];
      let fromSnapshot = false;

      try {
        const [ws, pg, t, f, st, bl, fo] = await Promise.all([
          repo.getWorkspace(),
          repo.getPages(),
          repo.getTasks(),
          repo.getFiles(),
          repo.getSettings(),
          repo.getAllBlocks(),
          repo.getFolders(),
        ]);
        const sanitized = sanitizeLoadedData({
          workspace: ws, pages: pg, blocks: bl, tasks: t, files: f, folders: fo, settings: st,
        });
        if (sanitized.data.workspace) {
          loaded = sanitized.data;
          issues = sanitized.issues;
        } else {
          // The workspace row is missing (deleted or corrupt) — restore from
          // the last backup snapshot if one exists, otherwise onboarding.
          try {
            loaded = await restoreFromSnapshot();
            fromSnapshot = loaded !== null;
          } catch {
            // no usable snapshot — onboarding
          }
        }
      } catch {
        // Primary rows unreadable — fall back to the last backup snapshot.
        fromSnapshot = true;
        try {
          loaded = await restoreFromSnapshot();
        } catch {
          // no usable snapshot either — fall through to fatal error
        }
      }

      if (cancelled) return;

      if (!loaded || !loaded.workspace) {
        setReady(true);
        return;
      }

      setWorkspace(loaded.workspace);
      setPages(loaded.pages);
      setBlocks(loaded.blocks);
      setTasks(loaded.tasks);
      setFiles(loaded.files);
      setFolders(loaded.folders);
      setSettings(loaded.settings);

      if (fromSnapshot) {
        pushNotice("info", "Recovered from the last backup snapshot.");
        // Rebuild the primary rows from memory so the next launch loads them
        // directly again. Non-destructive: only upserts the snapshot's rows.
        try {
          await repo.saveWorkspace(loaded.workspace);
          await repo.savePages(loaded.pages);
          await repo.saveBlocks(loaded.blocks);
          await repo.saveTasks(loaded.tasks);
          await repo.saveFiles(loaded.files);
          await repo.saveFolders(loaded.folders);
          await repo.saveSettings(loaded.settings);
          scheduleSnapshot();
        } catch {
          // memory-only recovery is fine for now
        }
      } else {
        if (issues.length > 0) {
          pushNotice("info", "Some saved data needed repair on load.");
        }
        void ensureSnapshot();
      }

      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, pushNotice, ensureSnapshot, scheduleSnapshot]);

  // ---- workspace ----
  const createWorkspace = useCallback(
    async (name: string) => {
      const ws = emptyWorkspace(name);
      const seed = seedWorkspace(ws.id);
      const st = defaultSettings(ws.id);
      const ok = await commit(
        ["workspace", "pages", "blocks", "tasks", "settings"],
        () =>
          repo.replaceWorkspace({
            workspace: ws,
            pages: seed.pages,
            blocks: seed.blocks,
            tasks: seed.tasks,
            files: [],
            folders: [],
            settings: st,
          }),
      );
      if (!ok) return;
      setWorkspace(ws);
      setPages(seed.pages);
      setTasks(seed.tasks);
      setFiles([]);
      setFolders([]);
      setBlocks(seed.blocks);
      setSettings(st);
      pushNotice("success", "Workspace created");
    },
    [repo, commit, pushNotice],
  );

  const renameWorkspace = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!workspace || !trimmed) return;
      const next = { ...workspace, name: trimmed, updatedAt: Date.now() };
      setWorkspace(next);
      markDirty("workspace");
      await commit(["workspace"], () => repo.saveWorkspace(next));
    },
    [workspace, repo, commit, markDirty],
  );

  const importArchive = useCallback(
    async (text: string): Promise<ImportResult> => {
      const result = parseLocusText(text);
      if (!result.ok || !result.data) return result;
      const data = result.data;
      const files: FileRef[] = data.files.map(({ data: _d, ...ref }) => ref);

      // Atomic replace: the old workspace stays fully intact if this fails.
      try {
        await repo.replaceWorkspace({
          workspace: data.workspace,
          pages: data.pages,
          blocks: data.blocks,
          tasks: data.tasks,
          files,
          folders: data.folders,
          settings: data.settings,
        });
      } catch {
        result.errors.push("Could not write the workspace to local storage.");
        return result;
      }

      // Files: inline bytes when present; otherwise metadata only.
      for (const file of data.files) {
        if (file.data) {
          try {
            const blob = decodeBase64File(file.data, file.type);
            await repo.saveFileBlob(file.blobKey, blob);
          } catch {
            result.warnings.push(`Could not restore file "${file.name}".`);
          }
        } else {
          result.warnings.push(`File "${file.name}" was stored by reference only (no bytes in this backup).`);
        }
      }

      setWorkspace(data.workspace);
      setPages(data.pages);
      setBlocks(data.blocks);
      setTasks(data.tasks);
      setFiles(files);
      setFolders(data.folders);
      setSettings(data.settings);
      notifySaved(["workspace", "pages", "blocks", "tasks", "files", "folders", "settings"]);
      scheduleSnapshot();
      pushNotice("success", "Workspace restored");
      return result;
    },
    [repo, pushNotice, notifySaved, scheduleSnapshot],
  );

  const resetWorkspace = useCallback(async () => {
    try {
      await repo.clearWorkspace();
    } catch {
      pushNotice("error", "Could not reset the workspace — local storage error.");
      return;
    }
    setWorkspace(null);
    setPages([]);
    setTasks([]);
    setFiles([]);
    setFolders([]);
    setBlocks([]);
    setSettings(null);
    notifySaved(["workspace", "pages", "blocks", "tasks", "files", "folders", "settings"]);
    window.location.hash = "#/";
  }, [repo, pushNotice, notifySaved]);

  const exportArchive = useCallback(async (): Promise<LocusArchive> => {
    if (!workspace || !settings) throw new Error("No workspace to export.");
    return buildArchive({
      workspace,
      settings,
      pages,
      tasks,
      files,
      folders,
      blocks,
      blobFor: async (file) => repo.getFileBlob(file),
    });
  }, [workspace, settings, pages, tasks, files, folders, blocks, repo]);

  // ---- pages ----
  const createPage = useCallback(
    async (parentId: ID | null, title?: string, folderId: ID | null = null): Promise<Page> => {
      if (!workspace) throw new Error("No workspace.");
      const page = newPage(workspace.id, title ?? "", parentId, folderId);
      setPages((p) => [page, ...p]);
      markDirty("pages");
      await commit(["pages"], () => repo.savePage(page));
      return page;
    },
    [workspace, repo, commit, markDirty],
  );

  const renamePage = useCallback(
    async (id: ID, title: string) => {
      const page = pages.find((p) => p.id === id);
      if (!page) return;
      const newTitle = safeTitle(title, "Untitled");
      const next: Page = { ...page, title: newTitle, updatedAt: Date.now() };
      setPages((p) => p.map((x) => (x.id === id ? next : x)));
      markDirty("pages");
      // Update [[old title]] links across all blocks to keep links working.
      const nextBlocks = page.title !== newTitle ? renameLinksInBlocks(blocks, page.title, newTitle) : blocks;
      if (nextBlocks !== blocks) {
        setBlocks(nextBlocks);
        markDirty("blocks");
      }
      await commit(nextBlocks !== blocks ? ["pages", "blocks"] : ["pages"], async () => {
        await repo.savePage(next);
        if (nextBlocks !== blocks) await repo.saveBlocks(nextBlocks);
      });
    },
    [pages, blocks, repo, commit, markDirty],
  );

  const deletePage = useCallback(
    async (id: ID) => {
      const doomed = collectDescendants(id, pages, true);
      const doomedSet = new Set(doomed);
      const nextPages = pages.filter((p) => !doomedSet.has(p.id));
      const nextBlocks = blocks.filter((b) => !doomedSet.has(b.pageId));
      // Unlink tasks that lived on deleted pages (keep the tasks).
      const nextTasks = tasks.map((t) =>
        t.pageId && doomedSet.has(t.pageId) ? { ...t, pageId: null } : t,
      );
      setPages(nextPages);
      setBlocks(nextBlocks);
      setTasks(nextTasks);
      markDirty("pages");
      markDirty("blocks");
      markDirty("tasks");
      const ok = await commit(["pages", "blocks", "tasks"], async () => {
        await repo.savePages(nextPages);
        await repo.saveBlocks(nextBlocks);
        await repo.saveTasks(nextTasks);
      });
      if (ok) pushNotice("success", "Page deleted");
    },
    [pages, blocks, tasks, repo, commit, markDirty, pushNotice],
  );

  const duplicatePage = useCallback(
    async (id: ID): Promise<Page | null> => {
      if (!workspace) return null;
      const source = pages.find((p) => p.id === id);
      if (!source) return null;
      const now = Date.now();
      const idMap = new Map<string, string>();
      const pagesToAdd: Page[] = [];
      const blocksToAdd: Block[] = [];

      const copyTree = (page: Page): Page => {
        const newId = uid();
        idMap.set(page.id, newId);
        const copy: Page = {
          ...page,
          id: newId,
          parentId: idMap.get(page.parentId ?? "") ?? page.parentId,
          title: page.id === id ? `${page.title} (copy)` : page.title,
          favorite: false,
          createdAt: now,
          updatedAt: now,
        };
        pagesToAdd.push(copy);
        for (const child of pages.filter((p) => p.parentId === page.id)) {
          copyTree(child);
        }
        for (const block of blocks.filter((b) => b.pageId === page.id)) {
          blocksToAdd.push({ ...block, id: uid(), pageId: copy.id, createdAt: now, updatedAt: now });
        }
        return copy;
      };

      const copy = copyTree(source);
      setPages((p) => [...pagesToAdd, ...p]);
      setBlocks((b) => [...b, ...blocksToAdd]);
      markDirty("pages");
      markDirty("blocks");
      const ok = await commit(["pages", "blocks"], async () => {
        await repo.savePages(pagesToAdd);
        await repo.saveBlocks(blocksToAdd);
      });
      if (ok) pushNotice("success", "Page duplicated");
      return copy;
    },
    [workspace, pages, blocks, repo, commit, markDirty, pushNotice],
  );

  const toggleFavoritePage = useCallback(
    async (id: ID) => {
      const page = pages.find((p) => p.id === id);
      if (!page) return;
      const next: Page = { ...page, favorite: !page.favorite, updatedAt: Date.now() };
      setPages((p) => p.map((x) => (x.id === id ? next : x)));
      markDirty("pages");
      await commit(["pages"], () => repo.savePage(next));
    },
    [pages, repo, commit, markDirty],
  );

  const setPageIcon = useCallback(
    async (id: ID, icon: string) => {
      const page = pages.find((p) => p.id === id);
      if (!page) return;
      const next: Page = { ...page, icon, updatedAt: Date.now() };
      setPages((p) => p.map((x) => (x.id === id ? next : x)));
      markDirty("pages");
      await commit(["pages"], () => repo.savePage(next));
    },
    [pages, repo, commit, markDirty],
  );

  const movePage = useCallback(
    async (id: ID, newParentId: ID | null, beforeId?: ID, folderId?: ID | null) => {
      const move = planMove(id, pages, newParentId, beforeId, folderId);
      if (!move) return;
      // Resolve the folder context: an explicit folderId wins; otherwise a
      // page inherits the folder of its parent page or the sibling it is
      // placed beside; moving to the top level always means folderId null.
      if (move.folderId === undefined) {
        if (move.parentId) {
          const parent = pages.find((p) => p.id === move.parentId);
          move.folderId = parent?.folderId ?? null;
        } else if (move.beforeId) {
          const sib = pages.find((p) => p.id === move.beforeId);
          move.folderId = sib?.folderId ?? null;
        } else {
          move.folderId = null;
        }
      }
      const next = applyMove(pages, move);
      setPages(next);
      markDirty("pages");
      await commit(["pages"], () => repo.savePages(next));
    },
    [pages, repo, commit, markDirty],
  );

  const updatePage = useCallback(
    async (patch: Partial<Page>) => {
      const existing = pages.find((p) => p.id === patch.id);
      if (!existing) return;
      const next: Page = { ...existing, ...patch, updatedAt: Date.now() };
      setPages((p) => p.map((x) => (x.id === patch.id ? next : x)));
      markDirty("pages");
      await commit(["pages"], () => repo.savePage(next));
    },
    [pages, repo, commit, markDirty],
  );

  // ---- folders ----
  const createFolder = useCallback(
    async (parentId: ID | null): Promise<Folder> => {
      if (!workspace) throw new Error("No workspace.");
      const folder = newFolder(workspace.id, "", parentId);
      setFolders((f) => [folder, ...f]);
      markDirty("folders");
      await commit(["folders"], () => repo.saveFolder(folder));
      return folder;
    },
    [workspace, repo, commit, markDirty],
  );

  const renameFolder = useCallback(
    async (id: ID, name: string) => {
      const folder = folders.find((f) => f.id === id);
      if (!folder) return;
      const next: Folder = { ...folder, name: name.trim() || folder.name, updatedAt: Date.now() };
      setFolders((f) => f.map((x) => (x.id === id ? next : x)));
      markDirty("folders");
      await commit(["folders"], () => repo.saveFolder(next));
    },
    [folders, repo, commit, markDirty],
  );

  const setFolderIcon = useCallback(
    async (id: ID, icon: string) => {
      const folder = folders.find((f) => f.id === id);
      if (!folder) return;
      const next: Folder = { ...folder, icon: icon.slice(0, 16), updatedAt: Date.now() };
      setFolders((f) => f.map((x) => (x.id === id ? next : x)));
      markDirty("folders");
      await commit(["folders"], () => repo.saveFolder(next));
    },
    [folders, repo, commit, markDirty],
  );

  /**
   * Deleting a folder never destroys its contents: pages, files and
   * subfolders are moved up one level (into the folder's parent, or root).
   */
  const deleteFolder = useCallback(
    async (id: ID) => {
      const target = folders.find((f) => f.id === id);
      if (!target) return;
      const doomed = collectFolderDescendants(id, folders, true);
      const doomedSet = new Set(doomed);
      const parentId = target.parentId;

      const nextPages = pages.map((p) =>
        p.folderId && doomedSet.has(p.folderId) ? { ...p, folderId: parentId, updatedAt: Date.now() } : p,
      );
      const nextFiles = files.map((f) =>
        f.folderId && doomedSet.has(f.folderId) ? { ...f, folderId: parentId, updatedAt: Date.now() } : f,
      );
      const nextFolders = folders
        .filter((f) => !doomedSet.has(f.id))
        .map((f) =>
          f.parentId && doomedSet.has(f.parentId) ? { ...f, parentId, updatedAt: Date.now() } : f,
        );

      setPages(nextPages);
      setFiles(nextFiles);
      setFolders(nextFolders);
      markDirty("folders");
      markDirty("pages");
      markDirty("files");
      await commit(["folders", "pages", "files"], async () => {
        await Promise.all([
          repo.savePages(nextPages),
          repo.saveFiles(nextFiles),
          repo.saveFolders(nextFolders),
          repo.deleteFolder(id),
        ]);
      });
    },
    [pages, files, folders, repo, commit, markDirty],
  );

  const moveFolder = useCallback(
    async (id: ID, newParentId: ID | null, beforeId?: ID) => {
      const move = planFolderMove(id, folders, newParentId, beforeId);
      if (!move) return;
      const next = applyFolderMove(folders, { folderId: id, ...move });
      setFolders(next);
      markDirty("folders");
      await commit(["folders"], () => repo.saveFolders(next));
    },
    [folders, repo, commit, markDirty],
  );

  const moveFile = useCallback(
    async (id: ID, folderId: ID | null) => {
      const file = files.find((f) => f.id === id);
      if (!file) return;
      const next: FileRef = { ...file, folderId, updatedAt: Date.now() };
      setFiles((f) => f.map((x) => (x.id === id ? next : x)));
      markDirty("files");
      await commit(["files"], () => repo.saveFile(next));
    },
    [files, repo, commit, markDirty],
  );

  // ---- blocks ----
  const blocksForPage = useCallback(
    (pageId: ID) => blocks.filter((b) => b.pageId === pageId),
    [blocks],
  );

  const saveBlocks = useCallback(
    async (pageId: ID, next: Block[]) => {
      const others = blocks.filter((b) => b.pageId !== pageId);
      setBlocks([...others, ...next]);
      markDirty("blocks");
      await commit(["blocks"], () => repo.saveBlocks(next));
    },
    [blocks, repo, commit, markDirty],
  );

  // ---- tasks ----
  const createTask = useCallback(
    async (title: string, pageId: ID | null = null): Promise<Task> => {
      if (!workspace) throw new Error("No workspace.");
      const task = newTask(workspace.id, title, pageId);
      setTasks((t) => [task, ...t]);
      markDirty("tasks");
      await commit(["tasks"], () => repo.saveTask(task));
      return task;
    },
    [workspace, repo, commit, markDirty],
  );

  const updateTask = useCallback(
    async (id: ID, patch: Partial<Task>) => {
      const existing = tasks.find((t) => t.id === id);
      if (!existing) return;
      const next: Task = { ...existing, ...patch, updatedAt: Date.now() };
      setTasks((t) => t.map((x) => (x.id === id ? next : x)));
      markDirty("tasks");
      await commit(["tasks"], () => repo.saveTask(next));
    },
    [tasks, repo, commit, markDirty],
  );

  const deleteTask = useCallback(
    async (id: ID) => {
      setTasks((t) => t.filter((x) => x.id !== id));
      markDirty("tasks");
      await commit(["tasks"], () => repo.deleteTask(id));
    },
    [repo, commit, markDirty],
  );

  const toggleFavoriteTask = useCallback(
    async (id: ID) => {
      const existing = tasks.find((t) => t.id === id);
      if (!existing) return;
      const next: Task = { ...existing, favorite: !existing.favorite, updatedAt: Date.now() };
      setTasks((t) => t.map((x) => (x.id === id ? next : x)));
      markDirty("tasks");
      await commit(["tasks"], () => repo.saveTask(next));
    },
    [tasks, repo, commit, markDirty],
  );

  // ---- files ----
  const fileKindFor = (type: string, name: string): FileRef["kind"] => {
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("audio/")) return "audio";
    if (type.startsWith("video/")) return "video";
    if (type.includes("pdf") || /\.(pdf|docx?|xlsx?|pptx?|txt|md|rtf|odt|ods|odp)$/i.test(name)) return "document";
    if (type.includes("zip") || /\.(zip|tar|gz|7z|rar)$/i.test(name)) return "archive";
    return "other";
  };

  const addFiles = useCallback(
    async (fileList: File[], folderId: ID | null = null): Promise<FileRef[]> => {
      if (!workspace) return [];
      const added: FileRef[] = [];
      for (const file of fileList) {
        const blobKey = uid();
        try {
          await repo.saveFileBlob(blobKey, file);
        } catch {
          pushNotice("error", `"${file.name}" is too large to store locally.`);
          continue;
        }
        const ref: FileRef = newFileRef(
          workspace.id,
          file.name,
          file.size,
          file.type || "application/octet-stream",
          fileKindFor(file.type, file.name),
          blobKey,
          folderId,
        );
        added.push(ref);
      }
      if (added.length > 0) {
        setFiles((prev) => [...prev, ...added]);
        markDirty("files");
        await commit(["files"], async () => {
          for (const ref of added) await repo.saveFile(ref);
        });
      }
      return added;
    },
    [workspace, pushNotice, repo, commit, markDirty]
  );

  const renameFile = useCallback(
    async (id: ID, name: string) => {
      const file = files.find((f) => f.id === id);
      if (!file) return;
      const next = { ...file, name: name || file.name, updatedAt: Date.now() };
      setFiles((f) => f.map((x) => (x.id === id ? next : x)));
      markDirty("files");
      await commit(["files"], () => repo.saveFile(next));
    },
    [files, repo, commit, markDirty],
  );

  const deleteFile = useCallback(
    async (id: ID) => {
      const file = files.find((f) => f.id === id);
      setFiles((f) => f.filter((x) => x.id !== id));
      markDirty("files");
      await commit(["files"], async () => {
        if (file) await repo.deleteFileBlob(file.blobKey);
        await repo.deleteFile(id);
      });
    },
    [files, repo, commit, markDirty],
  );

  const attachFileToPage = useCallback(
    async (id: ID, pageId: ID | null) => {
      const file = files.find((f) => f.id === id);
      if (!file) return;
      const next = { ...file, pageId, updatedAt: Date.now() };
      setFiles((f) => f.map((x) => (x.id === id ? next : x)));
      markDirty("files");
      await commit(["files"], () => repo.saveFile(next));
    },
    [files, repo, commit, markDirty],
  );

  const getFileBlob = useCallback(
    async (file: FileRef) => repo.getFileBlob(file),
    [repo],
  );

  const toggleFavoriteFile = useCallback(
    async (id: ID) => {
      const existing = files.find((f) => f.id === id);
      if (!existing) return;
      const next: FileRef = { ...existing, favorite: !existing.favorite, updatedAt: Date.now() };
      setFiles((f) => f.map((x) => (x.id === id ? next : x)));
      markDirty("files");
      await commit(["files"], () => repo.saveFile(next));
    },
    [files, repo, commit, markDirty],
  );

  const fileKindCounts = useMemo<FileKindCounts>(() => {
    const counts: FileKindCounts = { image: 0, document: 0, audio: 0, video: 0, archive: 0, other: 0 };
    for (const f of files) counts[f.kind] += 1;
    return counts;
  }, [files]);

  // ---- settings ----
  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      if (!settings) return;
      const next = { ...settings, ...patch };
      setSettings(next);
      markDirty("settings");
      await commit(["settings"], () => repo.saveSettings(next));
    },
    [settings, repo, commit, markDirty],
  );

  const setTheme = useCallback(
    async (theme: ThemeSetting) => {
      await updateSettings({ theme });
    },
    [updateSettings],
  );

  const storageUsage = useCallback(async () => repo.estimateUsage(), [repo]);

  // ---- derived ----
  const tree = useMemo(() => buildTree(pages), [pages]);
  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
  const pageById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const backlinksForPage = useCallback(
    (pageId: ID): BacklinkRef[] => {
      const page = pageById.get(pageId);
      if (!page) return [];
      const blocksByPage = new Map<string, Block[]>();
      for (const b of blocks) {
        const list = blocksByPage.get(b.pageId);
        if (list) list.push(b);
        else blocksByPage.set(b.pageId, [b]);
      }
      return computeBacklinks(page, pages, blocksByPage);
    },
    [pageById, pages, blocks],
  );

  const recentPages = useMemo(() => {
    return [...pages].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  }, [pages]);

  const favorites = useMemo(() => {
    return {
      pages: pages.filter((p) => p.favorite),
      tasks: tasks.filter((t) => t.favorite),
      files: files.filter((f) => f.favorite),
    };
  }, [pages, tasks, files]);

  const value: AppContextValue = {
    ready,
    fatalError,
    workspace,
    pages,
    tasks,
    files,
    folders,
    blocks,
    settings,
    saveState,
    tree,
    folderTree,
    pageById,
    folderById,
    backlinksForPage,
    recentPages,
    favorites,
    createWorkspace,
    renameWorkspace,
    resetWorkspace,
    exportArchive,
    importArchive,
    createPage,
    renamePage,
    deletePage,
    duplicatePage,
    toggleFavoritePage,
    setPageIcon,
    movePage,
    updatePage,
    createFolder,
    renameFolder,
    setFolderIcon,
    deleteFolder,
    moveFolder,
    moveFile,
    blocksForPage,
    saveBlocks,
    createTask,
    updateTask,
    deleteTask,
    toggleFavoriteTask,
    addFiles,
    renameFile,
    deleteFile,
    attachFileToPage,
    toggleFavoriteFile,
    getFileBlob,
    fileKindCounts,
    updateSettings,
    setTheme,
    storageUsage,
    notices,
    pushNotice,
    dismissNotice,
    confirm,
    confirmState,
    closeConfirm,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>.");
  return ctx;
}

export { WORKSPACE_ID };
