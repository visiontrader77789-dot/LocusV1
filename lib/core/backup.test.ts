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
});
