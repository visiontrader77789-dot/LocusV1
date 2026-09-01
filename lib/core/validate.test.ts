import { describe, expect, it } from "vitest";
import { newBlock, newPage } from "@/lib/core/types";
import type { Page } from "@/lib/core/types";
import {
  dedupeById,
  repairRelationships,
  validateBlock,
  validateWorkspaceMeta,
} from "@/lib/core/validate";

describe("validateWorkspaceMeta", () => {
  it("coerces a malformed workspace into a usable shape", () => {
    const ws = validateWorkspaceMeta({ name: "My space", schemaVersion: "garbage" });
    expect(ws?.name).toBe("My space");
    expect(ws?.id).toBe("main");
    expect(ws?.schemaVersion).toBe(2);
  });

  it("returns null for non-objects", () => {
    expect(validateWorkspaceMeta(null)).toBeNull();
    expect(validateWorkspaceMeta("nope")).toBeNull();
    expect(validateWorkspaceMeta([])).toBeNull();
  });
});

describe("validateBlock", () => {
  it("rejects unknown block types with an error", () => {
    const errors: string[] = [];
    const block = validateBlock({ id: "b1", pageId: "p1", type: "hologram", content: "x" }, errors);
    expect(block).toBeNull();
    expect(errors.join()).toContain("hologram");
  });

  it("clamps indent and coerces fields", () => {
    const errors: string[] = [];
    const block = validateBlock(
      { id: "b1", pageId: "p1", type: "bulletList", content: "hi", indent: 99, checked: 1 },
      errors,
    );
    expect(block?.indent).toBe(10);
    expect(block?.checked).toBe(false);
    expect(block?.content).toBe("hi");
  });

  it("assigns a fresh id when the id is missing", () => {
    const errors: string[] = [];
    const block = validateBlock({ pageId: "p1", type: "paragraph" }, errors);
    expect(block?.id).toBeTruthy();
    expect(block?.id.length).toBeGreaterThan(0);
  });
});

describe("repairRelationships", () => {
  it("re-keys duplicate page ids so no page is lost", () => {
    const p1 = newPage("w", "One", null);
    const p2 = newPage("w", "Two", null);
    p2.id = p1.id;
    const pages = [p1, p2];
    const report = repairRelationships(pages, []);
    const ids = new Set(pages.map((p) => p.id));
    expect(ids.size).toBe(2);
    expect(report.reIded).toBe(1);
  });

  it("breaks a page parent cycle without losing content", () => {
    const a = newPage("w", "A", null);
    const b = newPage("w", "B", null);
    a.parentId = b.id;
    b.parentId = a.id;
    const pages = [a, b];
    const report = repairRelationships(pages, []);
    expect(report.cyclesBroken).toBe(2);
    const parentOf = (p: Page) => p.parentId;
    const root = pages.find((p) => parentOf(p) === null);
    expect(root).toBeTruthy();
    expect(pages.every((p) => p.id !== p.parentId)).toBe(true);
  });

  it("detaches self-parenting", () => {
    const a = newPage("w", "A", null);
    a.parentId = a.id;
    const report = repairRelationships([a], []);
    expect(report.cyclesBroken).toBe(1);
    expect(a.parentId).toBeNull();
  });

  it("detaches parentId pointing at an unknown page", () => {
    const a = newPage("w", "A", "ghost");
    const report = repairRelationships([a], []);
    expect(report.orphansParented).toBe(1);
    expect(a.parentId).toBeNull();
  });

  it("breaks folder cycles and re-keys duplicate folders", () => {
    const f1 = { id: "f1", workspaceId: "w", name: "X", icon: "", parentId: "f2", order: 0, createdAt: 1, updatedAt: 1 };
    const f2 = { id: "f2", workspaceId: "w", name: "Y", icon: "", parentId: "f1", order: 0, createdAt: 1, updatedAt: 1 };
    const folders = [f1, f2];
    const report = repairRelationships([], folders);
    expect(report.cyclesBroken).toBe(2);
    expect(folders.some((f) => f.parentId === null)).toBe(true);
  });
});

describe("dedupeById", () => {
  it("assigns fresh ids to later duplicates, keeping all rows", () => {
    const a = newBlock("p1", "paragraph", "a");
    const b = newBlock("p1", "paragraph", "b");
    b.id = a.id;
    const blocks = [a, b];
    expect(dedupeById(blocks)).toBe(1);
    expect(new Set(blocks.map((x) => x.id)).size).toBe(2);
  });

  it("handles 50+ duplicate ids in one pass", () => {
    const blocks = Array.from({ length: 60 }, () => {
      return { id: "same", pageId: "p1", type: "paragraph" as const, content: "x", checked: false, indent: 0, rows: [], order: 0, createdAt: 0, updatedAt: 0 };
    });
    const reIded = dedupeById(blocks);
    expect(reIded).toBe(59);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(60);
  });

  it("returns 0 for an empty array", () => {
    expect(dedupeById([])).toBe(0);
  });

  it("returns 0 when all ids are already unique", () => {
    const blocks = [
      { id: "a", pageId: "p1", type: "paragraph" as const, content: "", checked: false, indent: 0, rows: [], order: 0, createdAt: 0, updatedAt: 0 },
      { id: "b", pageId: "p1", type: "paragraph" as const, content: "", checked: false, indent: 0, rows: [], order: 0, createdAt: 0, updatedAt: 0 },
    ];
    expect(dedupeById(blocks)).toBe(0);
  });
});
