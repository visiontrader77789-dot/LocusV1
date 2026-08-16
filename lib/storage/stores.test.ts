import { describe, expect, it } from "vitest";
import { MemoryBackend } from "@/lib/storage/memory";
import { Repository } from "@/lib/storage/stores";
import type { WorkspaceBundle } from "@/lib/storage/stores";
import { defaultSettings, emptyWorkspace, newPage, newTask } from "@/lib/core/types";

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
});
