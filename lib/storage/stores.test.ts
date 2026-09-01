import { describe, expect, it } from "vitest";
import { MemoryBackend } from "@/lib/storage/memory";
import { Repository } from "@/lib/storage/stores";
import type { WorkspaceBundle } from "@/lib/storage/stores";
import { defaultSettings, emptyWorkspace, newBlock, newFileRef, newFolder, newPage, newTask } from "@/lib/core/types";

const ws = emptyWorkspace("Test");
const settings = defaultSettings(ws.id);

function bundle(): WorkspaceBundle {
  const p = newPage(ws.id, "Notes", null);
  const t = newTask(ws.id, "todo");
  return {
    workspace: ws,
    settings,
    pages: [p],
    blocks: [],
    tasks: [t],
    files: [],
    folders: [],
  };
}

describe("Repository.replaceWorkspace", () => {
  it("writes the whole workspace and reads it back", async () => {
    const repo = new Repository(new MemoryBackend());
    const b = bundle();
    await repo.replaceWorkspace(b);

    expect((await repo.getWorkspace())?.name).toBe("Test");
    expect(await repo.getPages()).toHaveLength(1);
    expect(await repo.getTasks()).toHaveLength(1);
    expect(await repo.getSettings()).toMatchObject({ workspaceId: ws.id });
  });

  it("is atomic: a failed write leaves the previous workspace intact", async () => {
    const backend = new MemoryBackend();
    const repo = new Repository(backend);

    // Seed an existing workspace that must survive the failed replacement.
    const old = bundle();
    old.pages[0].id = "old-page";
    await repo.replaceWorkspace(old);

    // Make the next transaction throw when it reaches the "pages" puts.
    class ThrowingMap extends Map<string, unknown> {
      armed = false;
      set(key: string, value: unknown) {
        if (this.armed && key.startsWith("pages:")) throw new Error("quota exceeded");
        return super.set(key, value);
      }
    }
    const existing = (backend as unknown as { kv: Map<string, unknown> }).kv;
    const throwing = new ThrowingMap();
    for (const [k, v] of existing) throwing.set(k, v);
    throwing.armed = true;
    (backend as unknown as { kv: Map<string, unknown> }).kv = throwing;

    const next = bundle();
    await expect(repo.replaceWorkspace(next)).rejects.toThrow("quota exceeded");

    // Nothing was partially applied.
    expect((await repo.getPages()).map((p) => p.id)).toEqual(["old-page"]);
    expect((await repo.getWorkspace())?.name).toBe("Test");
  });
});

describe("Repository.clearWorkspace", () => {
  it("empties every table and the blob store", async () => {
    const backend = new MemoryBackend();
    const repo = new Repository(backend);
    await repo.replaceWorkspace(bundle());
    await repo.saveFileBlob("bk", new Blob(["x"]));

    await repo.clearWorkspace();

    expect(await repo.getWorkspace()).toBeNull();
    expect(await repo.getPages()).toEqual([]);
    expect(await repo.getTasks()).toEqual([]);
    expect(await repo.getFiles()).toEqual([]);
    expect(await repo.getFolders()).toEqual([]);
    expect(await repo.getSettings()).toMatchObject({ workspaceId: "main" });
    expect(await backend.getAllBlobKeys()).toEqual([]);
  });
});

describe("Repository snapshot", () => {
  it("round-trips the backup snapshot row", async () => {
    const repo = new Repository(new MemoryBackend());
    await repo.saveSnapshot('{"format":"locus"}');
    expect(await repo.getSnapshot()).toBe('{"format":"locus"}');
    expect(await repo.getSnapshot()).not.toBeNull();
  });
});

describe("MemoryBackend.transact", () => {
  it("clears only the targeted table within a transaction", async () => {
    const backend = new MemoryBackend();
    await backend.put("pages", "a", { id: "a" });
    await backend.put("blocks", "b", { id: "b" });
    await backend.transact([{ op: "clearTable", table: "pages" }]);
    expect(await backend.get<unknown>("pages", "a")).toBeNull();
    expect(await backend.get<unknown>("blocks", "b")).not.toBeNull();
  });

  it("applies blobs inside the same atomic batch", async () => {
    const backend = new MemoryBackend();
    await backend.transact([
      { op: "put", table: "pages", key: "p1", value: { id: "p1" } },
      { op: "putBlob", key: "bk", blob: new Blob(["x"]) },
    ]);
    expect(await backend.get<unknown>("pages", "p1")).not.toBeNull();
    expect(await backend.getBlob("bk")).not.toBeNull();
  });

  it("rolls back all changes on error mid-transaction", async () => {
    const backend = new MemoryBackend();
    await backend.put("pages", "existing", { id: "existing" });

    class FailOnP2 extends Map<string, unknown> {
      set(key: string, value: unknown) {
        if (key === "pages:new-page") throw new Error("boom");
        return super.set(key, value);
      }
    }
    const fail = new FailOnP2();
    for (const [k, v] of (backend as unknown as { kv: Map<string, unknown> }).kv) fail.set(k, v);
    (backend as unknown as { kv: Map<string, unknown> }).kv = fail;

    await expect(
      backend.transact([
        { op: "put", table: "pages", key: "existing", value: { id: "existing", modified: true } },
        { op: "put", table: "pages", key: "new-page", value: { id: "new-page" } },
      ])
    ).rejects.toThrow("boom");

    const existing = await backend.get<{ id: string }>("pages", "existing");
    expect(existing).not.toBeNull();
    expect((existing as { modified?: boolean }).modified).toBeUndefined();
  });
});

describe("Repository large workspace", () => {
  it("writes and reads back 100 pages and 1000 blocks", async () => {
    const repo = new Repository(new MemoryBackend());
    const pages = Array.from({ length: 100 }, (_, i) => newPage(ws.id, `Page ${i}`, null));
    const blocks = pages.flatMap((p) =>
      Array.from({ length: 10 }, (_, j) => newBlock(p.id, "paragraph", `block-${j}`))
    );
    const tasks = Array.from({ length: 50 }, (_, i) => newTask(ws.id, `task-${i}`));

    await repo.replaceWorkspace({
      workspace: ws,
      settings,
      pages,
      blocks,
      tasks,
      files: [],
      folders: [],
    });

    expect(await repo.getPages()).toHaveLength(100);
    expect(await repo.getAllBlocks()).toHaveLength(1000);
    expect(await repo.getTasks()).toHaveLength(50);
  });
});

describe("Repository consecutive replaceWorkspace", () => {
  it("consecutive calls produce correct final state", async () => {
    const repo = new Repository(new MemoryBackend());
    await repo.replaceWorkspace({
      workspace: ws,
      settings,
      pages: [newPage(ws.id, "First", null)],
      blocks: [],
      tasks: [],
      files: [],
      folders: [],
    });
    await repo.replaceWorkspace({
      workspace: ws,
      settings,
      pages: [newPage(ws.id, "Second", null), newPage(ws.id, "Third", null)],
      blocks: [],
      tasks: [],
      files: [],
      folders: [],
    });
    const pages = await repo.getPages();
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.title).sort()).toEqual(["Second", "Third"]);
  });

  it("concurrent async calls via interleaved awaits", async () => {
    const repo = new Repository(new MemoryBackend());
    const p1 = repo.replaceWorkspace({
      workspace: ws,
      settings,
      pages: [newPage(ws.id, "From A", null)],
      blocks: [],
      tasks: [],
      files: [],
      folders: [],
    });
    const p2 = repo.replaceWorkspace({
      workspace: ws,
      settings,
      pages: [newPage(ws.id, "From B", null)],
      blocks: [],
      tasks: [],
      files: [],
      folders: [],
    });
    await Promise.all([p1, p2]);
    const pages = await repo.getPages();
    expect(pages).toHaveLength(1);
    expect(["From A", "From B"]).toContain(pages[0].title);
  });
});

describe("Repository file blob round-trip", () => {
  it("saves and retrieves binary data", async () => {
    const repo = new Repository(new MemoryBackend());
    const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const blob = new Blob([data], { type: "application/octet-stream" });
    await repo.saveFileBlob("blob-key-1", blob);
    const retrieved = await repo.getFileBlob({ id: "f1", blobKey: "blob-key-1" } as never);
    expect(retrieved).not.toBeNull();
    const arr = new Uint8Array(await retrieved!.arrayBuffer());
    expect([...arr]).toEqual([72, 101, 108, 108, 111]);
  });

  it("saves file blobs inside replaceWorkspace transact", async () => {
    const repo = new Repository(new MemoryBackend());
    const file = { id: "f1", workspaceId: "main", name: "pic.png", size: 5, type: "image/png", kind: "image" as const, blobKey: "bk-pic", pageId: null, folderId: null, favorite: false, createdAt: 1, updatedAt: 1 };
    await repo.replaceWorkspace({
      workspace: ws,
      settings,
      pages: [],
      blocks: [],
      tasks: [],
      files: [file],
      folders: [],
    });
    await repo.saveFileBlob("bk-pic", new Blob(["bytes"]));
    const retrieved = await repo.getFileBlob({ blobKey: "bk-pic" } as never);
    expect(retrieved).not.toBeNull();
    expect(await retrieved!.text()).toBe("bytes");
  });

  it("clearWorkspace clears all file blobs", async () => {
    const repo = new Repository(new MemoryBackend());
    await repo.saveFileBlob("b1", new Blob(["a"]));
    await repo.saveFileBlob("b2", new Blob(["b"]));
    await repo.clearWorkspace();
    expect(await repo.getFileBlob({ blobKey: "b1" } as never)).toBeNull();
    expect(await repo.getFileBlob({ blobKey: "b2" } as never)).toBeNull();
  });
});

describe("Repository snapshot management", () => {
  it("getSnapshot returns null when no snapshot saved", async () => {
    const repo = new Repository(new MemoryBackend());
    expect(await repo.getSnapshot()).toBeNull();
  });

  it("saveSnapshot overwrites previous snapshot", async () => {
    const repo = new Repository(new MemoryBackend());
    await repo.saveSnapshot("v1");
    await repo.saveSnapshot("v2");
    expect(await repo.getSnapshot()).toBe("v2");
  });
});
