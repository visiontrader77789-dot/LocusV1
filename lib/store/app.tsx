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
  ID,
  Page,
  Settings,
  Task,
  ThemeSetting,
  Workspace,
} from "@/lib/core/types";
import { WORKSPACE_ID, defaultSettings, emptyWorkspace, newBlock, newPage, newTask } from "@/lib/core/types";
import { seedWorkspace } from "@/lib/core/seed";
import { buildTree, collectDescendants, planMove, safeTitle, applyMove } from "@/lib/core/tree";
import { computeBacklinks, renameLinksInBlocks, type BacklinkRef } from "@/lib/core/backlinks";
import { type LocusArchive, buildArchive, decodeBase64File, parseLocusText, type ImportResult } from "@/lib/core/serialize";
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

interface AppContextValue {
  ready: boolean;
  fatalError: string | null;
  workspace: Workspace | null;
  pages: Page[];
  tasks: Task[];
  files: FileRef[];
  blocks: Block[];
  settings: Settings | null;
  saveState: SaveState;

  // derived
  tree: ReturnType<typeof buildTree>;
  pageById: Map<string, Page>;
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
  createPage: (parentId: ID | null, title?: string) => Promise<Page>;
  renamePage: (id: ID, title: string) => Promise<void>;
  deletePage: (id: ID) => Promise<void>;
  duplicatePage: (id: ID) => Promise<Page | null>;
  toggleFavoritePage: (id: ID) => Promise<void>;
  setPageIcon: (id: ID, icon: string) => Promise<void>;
  movePage: (id: ID, newParentId: ID | null, beforeId?: ID) => Promise<void>;
  updatePage: (patch: Partial<Page>) => Promise<void>;

  // blocks
  blocksForPage: (pageId: ID) => Block[];
  saveBlocks: (pageId: ID, blocks: Block[]) => Promise<void>;

  // tasks
  createTask: (title: string, pageId?: ID | null) => Promise<Task>;
  updateTask: (id: ID, patch: Partial<Task>) => Promise<void>;
  deleteTask: (id: ID) => Promise<void>;
  toggleFavoriteTask: (id: ID) => Promise<void>;

  // files
  addFiles: (files: File[]) => Promise<FileRef[]>;
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
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [notices, setNotices] = useState<Notice[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmRequest | null>(null);

  const saveTimer = useRef<number | null>(null);

  const repo = useMemo(() => new Repository(backendRef.current ?? makeBackend()), []);

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

  // ---- init ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await repo.backend.init();
        const ws = await repo.getWorkspace();
        if (cancelled) return;
        if (ws) {
          const [pg, t, f, st, bl] = await Promise.all([
            repo.getPages(),
            repo.getTasks(),
            repo.getFiles(),
            repo.getSettings(),
            repo.getAllBlocks(),
          ]);
          if (cancelled) return;
          setWorkspace(ws);
          setPages(pg);
          setTasks(t);
          setFiles(f);
          setSettings(st);
          setBlocks(bl);
        }
      } catch (e) {
        if (!cancelled) {
          setFatalError(e instanceof Error ? e.message : "Local storage is unavailable.");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo]);

  // ---- workspace ----
  const createWorkspace = useCallback(
    async (name: string) => {
      const ws = emptyWorkspace(name);
      const seed = seedWorkspace(ws.id);
      await repo.saveWorkspace(ws);
      await repo.savePages(seed.pages);
      await repo.saveBlocks(seed.blocks);
      await repo.saveTasks(seed.tasks);
      const st = defaultSettings(ws.id);
      await repo.saveSettings(st);
      setWorkspace(ws);
      setPages(seed.pages);
      setTasks(seed.tasks);
      setFiles([]);
      setBlocks(seed.blocks);
      setSettings(st);
      pushNotice("success", "Workspace created");
    },
    [repo, pushNotice],
  );

  const renameWorkspace = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!workspace || !trimmed) return;
      const next = { ...workspace, name: trimmed, updatedAt: Date.now() };
      setWorkspace(next);
      await repo.saveWorkspace(next);
      setSave("saved");
    },
    [workspace, repo, setSave],
  );

  const importArchive = useCallback(
    async (text: string): Promise<ImportResult> => {
      const result = parseLocusText(text);
      if (!result.ok || !result.data) return result;
      const data = result.data;

      await repo.clearWorkspace();
      await repo.saveWorkspace(data.workspace);
      await repo.savePages(data.pages);
      await repo.saveBlocks(data.blocks);
      await repo.saveTasks(data.tasks);
      await repo.saveSettings(data.settings);

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
        await repo.saveFile(file);
      }

      setWorkspace(data.workspace);
      setPages(data.pages);
      setBlocks(data.blocks);
      setTasks(data.tasks);
      setFiles(data.files);
      setSettings(data.settings);
      pushNotice("success", "Workspace restored");
      return result;
    },
    [repo, pushNotice],
  );

  const resetWorkspace = useCallback(async () => {
    await repo.clearWorkspace();
    setWorkspace(null);
    setPages([]);
    setTasks([]);
    setFiles([]);
    setBlocks([]);
    setSettings(null);
    window.location.hash = "#/";
  }, [repo]);

  const exportArchive = useCallback(async (): Promise<LocusArchive> => {
    if (!workspace || !settings) throw new Error("No workspace to export.");
    return buildArchive({
      workspace,
      settings,
      pages,
      tasks,
      files,
      blocks,
      blobFor: async (file) => repo.getFileBlob(file),
    });
  }, [workspace, settings, pages, tasks, files, blocks, repo]);

  // ---- pages ----
  const createPage = useCallback(
    async (parentId: ID | null, title?: string): Promise<Page> => {
      if (!workspace) throw new Error("No workspace.");
      const page = newPage(workspace.id, title ?? "", parentId);
      setPages((p) => [page, ...p]);
      await repo.savePage(page);
      setSave("saved");
      return page;
    },
    [workspace, repo, setSave],
  );

  const renamePage = useCallback(
    async (id: ID, title: string) => {
      const page = pages.find((p) => p.id === id);
      if (!page) return;
      const newTitle = safeTitle(title, "Untitled");
      const next: Page = { ...page, title: newTitle, updatedAt: Date.now() };
      setPages((p) => p.map((x) => (x.id === id ? next : x)));
      await repo.savePage(next);
      setSave("saved");
      // Update [[old title]] links across all blocks to keep links working.
      if (page.title !== newTitle) {
        const nextBlocks = renameLinksInBlocks(blocks, page.title, newTitle);
        if (nextBlocks !== blocks) {
          setBlocks(nextBlocks);
          await repo.saveBlocks(nextBlocks);
        }
      }
    },
    [pages, blocks, repo, setSave],
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
      await repo.savePages(nextPages);
      await repo.saveBlocks(nextBlocks);
      await repo.saveTasks(nextTasks);
      setSave("saved");
      pushNotice("success", "Page deleted");
    },
    [pages, blocks, tasks, repo, setSave, pushNotice],
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
      await repo.savePages(pagesToAdd);
      await repo.saveBlocks(blocksToAdd);
      setSave("saved");
      pushNotice("success", "Page duplicated");
      return copy;
    },
    [workspace, pages, blocks, repo, setSave, pushNotice],
  );

  const toggleFavoritePage = useCallback(
    async (id: ID) => {
      const page = pages.find((p) => p.id === id);
      if (!page) return;
      const next: Page = { ...page, favorite: !page.favorite, updatedAt: Date.now() };
      setPages((p) => p.map((x) => (x.id === id ? next : x)));
      await repo.savePage(next);
    },
    [pages, repo],
  );

  const setPageIcon = useCallback(
    async (id: ID, icon: string) => {
      const page = pages.find((p) => p.id === id);
      if (!page) return;
      const next: Page = { ...page, icon, updatedAt: Date.now() };
      setPages((p) => p.map((x) => (x.id === id ? next : x)));
      await repo.savePage(next);
    },
    [pages, repo],
  );

  const movePage = useCallback(
    async (id: ID, newParentId: ID | null, beforeId?: ID) => {
      const move = planMove(id, pages, newParentId, beforeId);
      if (!move) return;
      const next = applyMove(pages, move);
      setPages(next);
      await repo.savePages(next);
      setSave("saved");
    },
    [pages, repo, setSave],
  );

  const updatePage = useCallback(
    async (patch: Partial<Page>) => {
      const existing = pages.find((p) => p.id === patch.id);
      if (!existing) return;
      const next: Page = { ...existing, ...patch, updatedAt: Date.now() };
      setPages((p) => p.map((x) => (x.id === patch.id ? next : x)));
      await repo.savePage(next);
      setSave("saved");
    },
    [pages, repo, setSave],
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
      setSave("saving");
      try {
        await repo.saveBlocks(next);
        setSave("saved");
      } catch {
        setSave("error");
        pushNotice("error", "Could not save — your data is still in this tab.");
      }
    },
    [blocks, repo, setSave, pushNotice],
  );

  // ---- tasks ----
  const createTask = useCallback(
    async (title: string, pageId: ID | null = null): Promise<Task> => {
      if (!workspace) throw new Error("No workspace.");
      const task = newTask(workspace.id, title, pageId);
      setTasks((t) => [task, ...t]);
      await repo.saveTask(task);
      return task;
    },
    [workspace, repo],
  );

  const updateTask = useCallback(
    async (id: ID, patch: Partial<Task>) => {
      const existing = tasks.find((t) => t.id === id);
      if (!existing) return;
      const next: Task = { ...existing, ...patch, updatedAt: Date.now() };
      setTasks((t) => t.map((x) => (x.id === id ? next : x)));
      await repo.saveTask(next);
    },
    [tasks, repo],
  );

  const deleteTask = useCallback(
    async (id: ID) => {
      setTasks((t) => t.filter((x) => x.id !== id));
      await repo.deleteTask(id);
    },
    [repo],
  );

  const toggleFavoriteTask = useCallback(
    async (id: ID) => {
      const existing = tasks.find((t) => t.id === id);
      if (!existing) return;
      const next: Task = { ...existing, favorite: !existing.favorite, updatedAt: Date.now() };
      setTasks((t) => t.map((x) => (x.id === id ? next : x)));
      await repo.saveTask(next);
    },
    [tasks, repo],
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
    async (fileList: File[]): Promise<FileRef[]> => {
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
        const ref: FileRef = {
          id: uid(),
          workspaceId: workspace.id,
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          kind: fileKindFor(file.type, file.name),
          blobKey,
          pageId: null,
          favorite: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        added.push(ref);
        await repo.saveFile(ref);
      }
      if (added.length > 0) {
        setFiles((prev) => [...prev, ...added]);
      }
      return added;
    },
    [workspace, files]
  );

  const renameFile = useCallback(
    async (id: ID, name: string) => {
      const file = files.find((f) => f.id === id);
      if (!file) return;
      const next = { ...file, name: name || file.name, updatedAt: Date.now() };
      setFiles((f) => f.map((x) => (x.id === id ? next : x)));
      await repo.saveFile(next);
    },
    [files, repo],
  );

  const deleteFile = useCallback(
    async (id: ID) => {
      const file = files.find((f) => f.id === id);
      setFiles((f) => f.filter((x) => x.id !== id));
      if (file) await repo.deleteFileBlob(file.blobKey);
      await repo.deleteFile(id);
    },
    [files, repo],
  );

  const attachFileToPage = useCallback(
    async (id: ID, pageId: ID | null) => {
      const file = files.find((f) => f.id === id);
      if (!file) return;
      const next = { ...file, pageId, updatedAt: Date.now() };
      setFiles((f) => f.map((x) => (x.id === id ? next : x)));
      await repo.saveFile(next);
    },
    [files, repo],
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
      await repo.saveFile(next);
    },
    [files, repo],
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
      await repo.saveSettings(next);
    },
    [settings, repo],
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
  const pageById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);

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
    blocks,
    settings,
    saveState,
    tree,
    pageById,
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
