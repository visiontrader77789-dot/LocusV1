import { describe, expect, it } from "vitest";
import { newBlock, newPage, newTask, emptyWorkspace, defaultSettings } from "@/lib/core/types";
import { sanitizeLoadedData } from "@/lib/core/load";

const ws = emptyWorkspace("Test");

describe("sanitizeLoadedData", () => {
  it("returns a null workspace and default settings when nothing is stored", () => {
    const { data } = sanitizeLoadedData({});
    expect(data.workspace).toBeNull();
    expect(data.pages).toEqual([]);
    expect(data.settings.theme).toBe("system");
    expect(data.settings.workspaceId).toBe("main");
  });

  it("drops unknown block types but reports the repair", () => {
    const page = newPage(ws.id, "Notes", null);
    const ok = newBlock(page.id, "paragraph", "fine");
    const junk = { id: "b2", pageId: page.id, type: "hologram", content: "x" };
    const { data, issues } = sanitizeLoadedData({ workspace: ws, pages: [page], blocks: [ok, junk] });
    expect(data.blocks.map((b) => b.id)).toEqual([ok.id]);
    expect(issues.join()).toContain("hologram");
  });

  it("drops blocks that point at a page that no longer exists", () => {
    const page = newPage(ws.id, "Notes", null);
    const orphan = newBlock("missing-page", "paragraph", "x");
    const { data } = sanitizeLoadedData({ workspace: ws, pages: [page], blocks: [orphan] });
    expect(data.blocks).toEqual([]);
  });

  it("re-keys duplicate page ids on load", () => {
    const a = newPage(ws.id, "A", null);
    const b = newPage(ws.id, "B", null);
    b.id = a.id;
    const { data, issues } = sanitizeLoadedData({ workspace: ws, pages: [a, b] });
    expect(new Set(data.pages.map((p) => p.id)).size).toBe(2);
    expect(issues.join()).toContain("duplicate");
  });

  it("breaks a parent cycle on load", () => {
    const a = newPage(ws.id, "A", null);
    const b = newPage(ws.id, "B", null);
    a.parentId = b.id;
    b.parentId = a.id;
    const { data } = sanitizeLoadedData({ workspace: ws, pages: [a, b] });
    const root = data.pages.find((p) => p.parentId === null);
    expect(root).toBeTruthy();
  });

  it("sanitizes malformed settings on load", () => {
    const { data } = sanitizeLoadedData({
      workspace: ws,
      settings: { theme: "solarized", editorFontSize: 999, workspaceId: ws.id },
    });
    expect(data.settings.theme).toBe("system");
    expect(data.settings.editorFontSize).toBe(22);
  });

  it("strips file byte data when loading from storage", () => {
    const { data } = sanitizeLoadedData({
      workspace: ws,
      files: [{ id: "f1", name: "pic.png", type: "image/png", kind: "image", blobKey: "bk", data: "AAAA" }],
    });
    expect(data.files).toHaveLength(1);
    expect("data" in data.files[0]).toBe(false);
  });

  it("migrates workspace schemaVersion to the current version", () => {
    const old = { ...ws, schemaVersion: 1 };
    const { data } = sanitizeLoadedData({ workspace: old, tasks: [newTask(ws.id, "t")] });
    expect(data.workspace?.schemaVersion).toBe(2);
  });

  it("loads a workspace with 50 pages and 500 blocks without error", () => {
    const pages = Array.from({ length: 50 }, (_, i) => newPage(ws.id, `Page ${i}`, null));
    const blocks = pages.flatMap((p) =>
      Array.from({ length: 10 }, (_, j) => newBlock(p.id, "paragraph", `block-${j}`))
    );
    const { data } = sanitizeLoadedData({ workspace: ws, pages, blocks });
    expect(data.pages).toHaveLength(50);
    expect(data.blocks).toHaveLength(500);
  });

  it("preserves all entity data with no silent drops across 100 entities", () => {
    const pages = Array.from({ length: 30 }, (_, i) => newPage(ws.id, `P${i}`, null));
    const blocks = pages.slice(0, 10).flatMap((p) =>
      Array.from({ length: 5 }, (_, j) => newBlock(p.id, "paragraph", `content-${j}`))
    );
    const tasks = Array.from({ length: 20 }, (_, i) => newTask(ws.id, `task-${i}`));
    const folders = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, workspaceId: "main", name: `Folder ${i}`, icon: "", parentId: null, order: i, createdAt: i, updatedAt: i }));
    const { data } = sanitizeLoadedData({ workspace: ws, pages, blocks, tasks, folders });
    expect(data.pages).toHaveLength(30);
    expect(data.blocks).toHaveLength(50);
    expect(data.tasks).toHaveLength(20);
    expect(data.folders).toHaveLength(10);
  });

  it("loads workspace with schemaVersion=1 including tasks (tasks migrate too)", () => {
    const old = { ...ws, schemaVersion: 1 };
    const task = newTask(ws.id, "t1");
    const { data } = sanitizeLoadedData({ workspace: old, tasks: [task] });
    expect(data.workspace?.schemaVersion).toBe(2);
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].title).toBe("t1");
  });

  it("loads workspace with schemaVersion=0", () => {
    const old = { ...ws, schemaVersion: 0 };
    const { data } = sanitizeLoadedData({ workspace: old });
    expect(data.workspace?.schemaVersion).toBe(2);
  });

  it("loads with multiple blocks for the same page", () => {
    const page = newPage(ws.id, "P", null);
    const blocks = Array.from({ length: 20 }, (_, i) => newBlock(page.id, "paragraph", `para-${i}`));
    const { data } = sanitizeLoadedData({ workspace: ws, pages: [page], blocks });
    expect(data.blocks).toHaveLength(20);
    expect(data.blocks.every((b) => b.pageId === page.id)).toBe(true);
  });

  it("auto-creates default settings when settings row is missing", () => {
    const { data } = sanitizeLoadedData({ workspace: ws });
    expect(data.settings.theme).toBe("system");
    expect(data.settings.editorFontSize).toBe(16);
    expect(data.settings.workspaceId).toBe(ws.id);
  });

  it("reloads a workspace that already has data into a fully usable state (no drop, no hang)", () => {
    // Regression guard for the reload-with-existing-data boot: the exact row set
    // persisted before a reload must sanitize into a non-null workspace with all
    // entities intact — the invariant the app depends on to leave the
    // "OPENING YOUR WORKSPACE" splash and set `ready`.
    const page = newPage(ws.id, "Persisted", null);
    const block = newBlock(page.id, "paragraph", "PERSIST_MARKER");
    const task = newTask(ws.id, "task");
    const settings = defaultSettings(ws.id);
    settings.theme = "dark";

    const { data } = sanitizeLoadedData({
      workspace: ws,
      pages: [page],
      blocks: [block],
      tasks: [task],
      settings,
    });

    expect(data.workspace).not.toBeNull();
    expect(data.workspace?.id).toBe(ws.id);
    expect(data.pages.map((p) => p.id)).toContain(page.id);
    expect(data.blocks.filter((b) => b.id === block.id)[0]?.content).toBe("PERSIST_MARKER");
    expect(data.tasks).toHaveLength(1);
    // Settings written before reload survive (empty-theme fallback would clobber them).
    expect(data.settings.theme).toBe("dark");
    expect(data.settings.workspaceId).toBe(ws.id);
  });
});
