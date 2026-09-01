import { describe, expect, it } from "vitest";
import { defaultSettings, emptyWorkspace, newBlock, newFileRef, newPage, newTask } from "@/lib/core/types";
import { buildSnapshot, parseSnapshot } from "@/lib/core/backup";

const ws = emptyWorkspace("Test");
const settings = defaultSettings(ws.id);

describe("buildSnapshot / parseSnapshot", () => {
  it("round-trips a workspace with entities and no file bytes", async () => {
    const page = newPage(ws.id, "Notes", null);
    const block = newBlock(page.id, "paragraph", "hi");
    const task = newTask(ws.id, "todo");
    const file = newFileRef(ws.id, "a.png", 10, "image/png", "image", "bk");

    const text = await buildSnapshot({
      workspace: ws,
      settings,
      pages: [page],
      blocks: [block],
      tasks: [task],
      files: [file],
      folders: [],
    });

    const archive = parseSnapshot(text);
    expect(archive).not.toBeNull();
    expect(archive?.workspace.name).toBe("Test");
    expect(archive?.workspace.schemaVersion).toBe(2);
    expect(archive?.pages.map((p) => p.title)).toEqual(["Notes"]);
    expect(archive?.blocks.map((b) => b.content)).toEqual(["hi"]);
    expect(archive?.tasks.map((t) => t.title)).toEqual(["todo"]);
    expect(archive?.files[0].data).toBeNull();
    expect(archive?.files[0].blobKey).toBe("bk");
  });

  it("handles a workspace with no content", async () => {
    const text = await buildSnapshot({
      workspace: ws,
      settings,
      pages: [],
      blocks: [],
      tasks: [],
      files: [],
      folders: [],
    });
    expect(parseSnapshot(text)).not.toBeNull();
  });

  it("returns null for unparseable snapshot text", () => {
    expect(parseSnapshot("not json")).toBeNull();
    expect(parseSnapshot("")).toBeNull();
    expect(parseSnapshot(JSON.stringify({ format: "other" }))).toBeNull();
  });

  it("round-trips a workspace with 50 pages", async () => {
    const pages = Array.from({ length: 50 }, (_, i) => newPage(ws.id, `Page ${i}`, null));
    const blocks = pages.flatMap((p) =>
      Array.from({ length: 3 }, (_, j) => newBlock(p.id, "paragraph", `block-${j}`))
    );
    const text = await buildSnapshot({
      workspace: ws, settings, pages, blocks, tasks: [], files: [], folders: [],
    });
    const archive = parseSnapshot(text);
    expect(archive).not.toBeNull();
    expect(archive?.pages).toHaveLength(50);
    expect(archive?.blocks).toHaveLength(150);
  });

  it("round-trips with folders in the snapshot", async () => {
    const folders = [
      { id: "f1", workspaceId: "main", name: "Docs", icon: "", parentId: null, order: 0, createdAt: 1, updatedAt: 1 },
      { id: "f2", workspaceId: "main", name: "Sub", icon: "", parentId: "f1", order: 1, createdAt: 2, updatedAt: 2 },
    ];
    const page = { ...newPage(ws.id, "In Folder", null), folderId: "f2" };
    const text = await buildSnapshot({
      workspace: ws, settings, pages: [page], blocks: [], tasks: [], files: [], folders,
    });
    const archive = parseSnapshot(text);
    expect(archive).not.toBeNull();
    expect(archive?.folders).toHaveLength(2);
    expect(archive?.pages[0].folderId).toBe("f2");
  });

  it("handles snapshot with unknown extra fields (format mismatch)", () => {
    const text = JSON.stringify({ format: "notion", version: 99, randomField: "abc" });
    expect(parseSnapshot(text)).toBeNull();
  });

  it("handles snapshot with format missing", () => {
    const text = JSON.stringify({ version: 1 });
    expect(parseSnapshot(text)).toBeNull();
  });

  it("round-trips a workspace with rich text spans", async () => {
    const page = newPage(ws.id, "Rich", null);
    const block = newBlock(page.id, "paragraph", "Hello world");
    block.rich = [{ from: 0, to: 5, bold: true }, { from: 6, to: 11, italic: true }];
    const text = await buildSnapshot({
      workspace: ws, settings, pages: [page], blocks: [block], tasks: [], files: [], folders: [],
    });
    const archive = parseSnapshot(text);
    expect(archive).not.toBeNull();
    expect(archive?.blocks[0].rich).toBeDefined();
    expect(archive?.blocks[0].rich).toHaveLength(2);
  });

  it("round-trips with tasks and files", async () => {
    const task = newTask(ws.id, "My task");
    task.priority = 2;
    task.completed = true;
    task.dueDate = "2025-12-31";
    task.tags = ["urgent", "backend"];
    const file = newFileRef(ws.id, "doc.pdf", 2048, "application/pdf", "document", "bk-doc");
    const text = await buildSnapshot({
      workspace: ws, settings, pages: [], blocks: [], tasks: [task], files: [file], folders: [],
    });
    const archive = parseSnapshot(text);
    expect(archive).not.toBeNull();
    expect(archive?.tasks[0].priority).toBe(2);
    expect(archive?.tasks[0].tags).toEqual(["urgent", "backend"]);
    expect(archive?.files[0].name).toBe("doc.pdf");
  });
});
