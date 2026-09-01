import { describe, expect, it } from "vitest";
import { emptyWorkspace, defaultSettings } from "@/lib/core/types";
import { sanitizeLoadedData } from "@/lib/core/load";
import { MemoryBackend } from "@/lib/storage/memory";
import { Repository } from "@/lib/storage/stores";

const ws = emptyWorkspace("Destruction");

describe("Phase 30: final destruction — every possible empty/partial/mixed state", () => {
  it("loads when all IDB tables are completely empty", () => {
    const { data, issues } = sanitizeLoadedData({});
    expect(data.workspace).toBeNull();
    expect(data.pages).toEqual([]);
    expect(data.blocks).toEqual([]);
    expect(data.tasks).toEqual([]);
    expect(data.files).toEqual([]);
    expect(data.folders).toEqual([]);
    expect(data.settings.workspaceId).toBe("main");
    expect(issues).toEqual([]);
  });

  it("loads when IDB has only a settings row", () => {
    const { data } = sanitizeLoadedData({
      settings: { theme: "dark", editorFontSize: 18, editorSpacing: "compact", coverPreset: "ink", workspaceId: "test", coverTitle: "", coverSubtitle: "" },
    });
    expect(data.workspace).toBeNull();
    expect(data.pages).toEqual([]);
    expect(data.settings.theme).toBe("dark");
    expect(data.settings.editorFontSize).toBe(18);
  });

  it("loads when workspace row is present but all entity tables are empty", () => {
    const { data } = sanitizeLoadedData({
      workspace: ws,
    });
    expect(data.workspace?.name).toBe("Destruction");
    expect(data.pages).toEqual([]);
    expect(data.blocks).toEqual([]);
    expect(data.tasks).toEqual([]);
  });

  it("loads when pages exist but workspace row is missing", () => {
    const page = { id: "p1", workspaceId: "main", title: "Orphan", icon: "", parentId: null, folderId: null, order: 0, createdAt: 1, updatedAt: 1, favorite: false };
    const { data } = sanitizeLoadedData({ pages: [page] });
    expect(data.workspace).toBeNull();
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0].title).toBe("Orphan");
  });

  it("loads when blocks exist but pages table is empty", () => {
    const block = { id: "b1", pageId: "missing-page", type: "paragraph", content: "x" };
    const { data } = sanitizeLoadedData({ blocks: [block] });
    expect(data.blocks).toEqual([]);
  });

  it("loads when tasks exist but workspace row is missing", () => {
    const task = { id: "t1", workspaceId: "main", title: "Task", notes: "", completed: false, priority: 0, dueDate: null, tags: [], favorite: false, createdAt: 1, updatedAt: 1 };
    const { data } = sanitizeLoadedData({ tasks: [task] });
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].title).toBe("Task");
  });

  it("loads when fileRefs exist but blobs table would be empty", () => {
    const file = { id: "f1", workspaceId: "main", name: "doc.pdf", size: 100, type: "application/pdf", kind: "document", blobKey: "bk1", pageId: null, folderId: null, favorite: false, createdAt: 1, updatedAt: 1 };
    const { data } = sanitizeLoadedData({ files: [file] });
    expect(data.files).toHaveLength(1);
    expect(data.files[0].blobKey).toBe("bk1");
  });

  it("loads when every row is a different garbage value", () => {
    const { data, issues } = sanitizeLoadedData({
      workspace: "not-an-object",
      pages: [42, null, "string", true],
      blocks: [{}, null, { type: "unknown", content: "x" }],
      tasks: [null, undefined, [], "bad"],
      files: [null, 999],
      folders: ["garbage", 42],
      settings: "garbage",
    });
    expect(data.workspace).toBeNull();
    expect(data.pages).toEqual([]);
    expect(data.blocks).toEqual([]);
    expect(data.tasks).toEqual([]);
    expect(data.files).toEqual([]);
    expect(data.folders).toEqual([]);
    expect(data.settings.theme).toBe("system");
    expect(issues.length).toBeGreaterThan(0);
  });

  it("loads when IDB contains rows from a completely different app", () => {
    const { data } = sanitizeLoadedData({
      workspace: { appName: "Notion", version: 3.0 },
      pages: [{ title: "Notion page", body: ["block1", "block2"] }],
      blocks: [{ text: "Hello world", style: "bold" }],
    });
    expect(data.workspace).not.toBeNull();
    expect(data.workspace?.name).toBe("Workspace");
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0].title).toBe("Notion page");
    expect(data.blocks).toEqual([]);
  });

  it("loads when schemaVersion=0 AND pages have duplicate ids AND blocks have missing pageIds", () => {
    const oldWs = { ...ws, schemaVersion: 0 };
    const pages = [
      { ...ws, id: "dup", title: "A", workspaceId: "main", createdAt: 1, updatedAt: 1, order: 0, favorite: false, parentId: null, folderId: null, icon: "" },
      { ...ws, id: "dup", title: "B", workspaceId: "main", createdAt: 1, updatedAt: 1, order: 0, favorite: false, parentId: null, folderId: null, icon: "" },
    ];
    const blocks = [
      { id: "b1", pageId: "nonexistent", type: "paragraph", content: "orphan" },
      { id: "b2", pageId: "dup", type: "paragraph", content: "valid" },
    ];
    const { data, issues } = sanitizeLoadedData({ workspace: oldWs, pages, blocks });
    expect(data.workspace?.schemaVersion).toBe(2);
    expect(new Set(data.pages.map((p) => p.id)).size).toBe(2);
    expect(data.blocks).toHaveLength(1);
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("Phase 30: MemoryBackend edge cases", () => {
  it("transact with empty ops array does nothing", async () => {
    const backend = new MemoryBackend();
    await backend.put("pages", "p1", { id: "p1" });
    await backend.transact([]);
    expect(await backend.get("pages", "p1")).not.toBeNull();
  });

  it("transact rolls back completely on error", async () => {
    const backend = new MemoryBackend();
    await backend.put("pages", "p1", { id: "p1", name: "original" });
    await backend.put("blocks", "b1", { id: "b1" });

    class FailMap extends Map<string, unknown> {
      set(key: string, value: unknown) {
        if (key === "pages:p2") throw new Error("disk full");
        return super.set(key, value);
      }
    }
    const fail = new FailMap();
    for (const [k, v] of (backend as unknown as { kv: Map<string, unknown> }).kv) fail.set(k, v);
    (backend as unknown as { kv: Map<string, unknown> }).kv = fail;

    await expect(
      backend.transact([
        { op: "put", table: "pages", key: "p1", value: { id: "p1", name: "modified" } },
        { op: "put", table: "pages", key: "p2", value: { id: "p2" } },
      ])
    ).rejects.toThrow("disk full");

    const p1 = await backend.get<{ id: string; name: string }>("pages", "p1");
    expect(p1?.name).toBe("original");
  });

  it("getAllBlobKeys returns empty array when no blobs", async () => {
    const backend = new MemoryBackend();
    expect(await backend.getAllBlobKeys()).toEqual([]);
  });

  it("clearBlobs is idempotent", async () => {
    const backend = new MemoryBackend();
    await backend.clearBlobs();
    await backend.clearBlobs();
    expect(await backend.getAllBlobKeys()).toEqual([]);
  });

  it("clear is idempotent on empty table", async () => {
    const backend = new MemoryBackend();
    await backend.clear("pages");
    await backend.clear("pages");
    expect(await backend.getAll("pages")).toEqual([]);
  });

  it("estimate returns zero usage for empty backend", async () => {
    const backend = new MemoryBackend();
    const est = await backend.estimate();
    expect(est.usage).toBe(0);
    expect(est.quota).toBe(0);
  });

  it("estimate sums blob sizes", async () => {
    const backend = new MemoryBackend();
    await backend.putBlob("b1", new Blob(["hello"]));
    await backend.putBlob("b2", new Blob(["world!"]));
    const est = await backend.estimate();
    expect(est.usage).toBe(11);
  });

  it("deleteBlob is safe to call for nonexistent key", async () => {
    const backend = new MemoryBackend();
    await backend.deleteBlob("nonexistent");
    expect(await backend.getBlob("nonexistent")).toBeNull();
  });

  it("delete is safe to call for nonexistent key", async () => {
    const backend = new MemoryBackend();
    await backend.delete("pages", "nonexistent");
    expect(await backend.get("pages", "nonexistent")).toBeNull();
  });
});

describe("Phase 30: Repository edge cases", () => {
  it("getSettings auto-creates defaults when no settings row exists", async () => {
    const repo = new Repository(new MemoryBackend());
    const settings = await repo.getSettings();
    expect(settings.theme).toBe("system");
    expect(settings.workspaceId).toBe("main");
  });

  it("getSettings uses workspace id from existing workspace row", async () => {
    const repo = new Repository(new MemoryBackend());
    await repo.saveWorkspace(ws);
    const settings = await repo.getSettings();
    expect(settings.workspaceId).toBe(ws.id);
  });

  it("getSnapshot returns null when no snapshot saved", async () => {
    const repo = new Repository(new MemoryBackend());
    expect(await repo.getSnapshot()).toBeNull();
  });

  it("saveSnapshot overwrites previous snapshot", async () => {
    const repo = new Repository(new MemoryBackend());
    await repo.saveSnapshot("first");
    await repo.saveSnapshot("second");
    expect(await repo.getSnapshot()).toBe("second");
  });

  it("clearWorkspace clears snapshot row (clears entire ws table)", async () => {
    const repo = new Repository(new MemoryBackend());
    await repo.replaceWorkspace({
      workspace: ws,
      settings: defaultSettings(ws.id),
      pages: [],
      blocks: [],
      tasks: [],
      files: [],
      folders: [],
    });
    await repo.saveSnapshot('{"format":"locus"}');
    await repo.clearWorkspace();
    expect(await repo.getSnapshot()).toBeNull();
    expect(await repo.getWorkspace()).toBeNull();
    expect(await repo.getPages()).toEqual([]);
  });

  it("getFiles and getFolders return empty on fresh backend", async () => {
    const repo = new Repository(new MemoryBackend());
    expect(await repo.getFiles()).toEqual([]);
    expect(await repo.getFolders()).toEqual([]);
  });

  it("file blob round-trip", async () => {
    const repo = new Repository(new MemoryBackend());
    const blob = new Blob(["test data"], { type: "text/plain" });
    await repo.saveFileBlob("key-1", blob);
    const retrieved = await repo.getFileBlob({ id: "f1", blobKey: "key-1" } as never);
    expect(retrieved).not.toBeNull();
    expect(await retrieved!.text()).toBe("test data");
  });

  it("file blob round-trip with binary data", async () => {
    const repo = new Repository(new MemoryBackend());
    const data = new Uint8Array([0, 1, 2, 255, 128, 64]);
    const blob = new Blob([data]);
    await repo.saveFileBlob("bin-key", blob);
    const retrieved = await repo.getFileBlob({ id: "f1", blobKey: "bin-key" } as never);
    expect(retrieved).not.toBeNull();
    const arr = new Uint8Array(await retrieved!.arrayBuffer());
    expect([...arr]).toEqual([0, 1, 2, 255, 128, 64]);
  });

  it("replaceWorkspace clears old rows not present in new bundle", async () => {
    const repo = new Repository(new MemoryBackend());
    await repo.replaceWorkspace({
      workspace: ws,
      settings: defaultSettings(ws.id),
      pages: [{ id: "p-old", workspaceId: "main", title: "Old", icon: "", parentId: null, folderId: null, order: 0, createdAt: 1, updatedAt: 1, favorite: false }],
      blocks: [{ id: "b-old", pageId: "p-old", type: "paragraph", content: "old", checked: false, indent: 0, rows: [], order: 0, createdAt: 1, updatedAt: 1, attachmentId: null }],
      tasks: [],
      files: [],
      folders: [],
    });

    await repo.replaceWorkspace({
      workspace: ws,
      settings: defaultSettings(ws.id),
      pages: [{ id: "p-new", workspaceId: "main", title: "New", icon: "", parentId: null, folderId: null, order: 0, createdAt: 2, updatedAt: 2, favorite: false }],
      blocks: [],
      tasks: [],
      files: [],
      folders: [],
    });

    const pages = await repo.getPages();
    expect(pages).toHaveLength(1);
    expect(pages[0].id).toBe("p-new");
    expect(await repo.getAllBlocks()).toHaveLength(0);
  });
});
