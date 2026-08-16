import { describe, expect, it } from "vitest";
import { newBlock, newPage, newTask, emptyWorkspace } from "@/lib/core/types";
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
});
