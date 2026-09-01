import { describe, expect, it } from "vitest";
import { emptyWorkspace, newBlock, newFileRef, newFolder, newPage, newTask, defaultSettings } from "@/lib/core/types";
import { sanitizeLoadedData } from "@/lib/core/load";
import { dedupeById, repairRelationships, validateBlock, validateFile, validateFolder, validatePage, validateSettings, validateTask } from "@/lib/core/validate";
import { migrateBlocks, migrateWorkspace } from "@/lib/core/migration";

const ws = emptyWorkspace("Stress");

describe("Phase 5-6: null and empty input", () => {
  it("loads cleanly with empty object (no workspace, no entities)", () => {
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

  it("loads cleanly with all fields set to undefined", () => {
    const { data } = sanitizeLoadedData({
      workspace: undefined,
      pages: undefined,
      blocks: undefined,
      tasks: undefined,
      files: undefined,
      folders: undefined,
      settings: undefined,
    });
    expect(data.workspace).toBeNull();
    expect(data.pages).toEqual([]);
    expect(data.settings.theme).toBe("system");
  });

  it("loads cleanly with null for all fields", () => {
    const { data } = sanitizeLoadedData({
      workspace: null,
      pages: null,
      blocks: null,
      tasks: null,
      files: null,
      folders: null,
      settings: null,
    });
    expect(data.workspace).toBeNull();
    expect(data.pages).toEqual([]);
    expect(data.blocks).toEqual([]);
    expect(data.tasks).toEqual([]);
  });
});

describe("Phase 7: garbage entity injection", () => {
  it("loads with pages containing null entries", () => {
    const { data, issues } = sanitizeLoadedData({
      workspace: ws,
      pages: [null, undefined, 42, "string", { id: "good", workspaceId: "main", title: "OK", createdAt: 1, updatedAt: 1, order: 0, favorite: false, parentId: null, folderId: null, icon: "" }],
    });
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0].title).toBe("OK");
  });

  it("loads with blocks containing garbage entries mixed with valid", () => {
    const page = newPage(ws.id, "P", null);
    const validBlock = newBlock(page.id, "paragraph", "ok");
    const garbage = [
      null,
      42,
      { type: "unknown_type", pageId: page.id },
      { pageId: page.id },
      "just a string",
    ];
    const { data, issues } = sanitizeLoadedData({
      workspace: ws,
      pages: [page],
      blocks: [validBlock, ...garbage],
    });
    expect(data.blocks).toHaveLength(1);
    expect(data.blocks[0].id).toBe(validBlock.id);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("loads with tasks containing mixed garbage", () => {
    const { data } = sanitizeLoadedData({
      workspace: ws,
      tasks: [null, 123, {}, { title: "real task" }],
    });
    expect(data.tasks.length).toBeGreaterThanOrEqual(1);
    expect(data.tasks.some((t) => t.title === "real task")).toBe(true);
  });

  it("loads with files containing garbage entries", () => {
    const { data } = sanitizeLoadedData({
      workspace: ws,
      files: [null, "bad", { name: "test.png", type: "image/png" }],
    });
    expect(data.files).toHaveLength(1);
    expect(data.files[0].name).toBe("test.png");
  });

  it("loads with folders containing garbage entries", () => {
    const { data } = sanitizeLoadedData({
      workspace: ws,
      folders: [null, 999, { id: "f1", workspaceId: "main", name: "Docs", createdAt: 1, updatedAt: 1, order: 0, parentId: null, icon: "" }],
    });
    expect(data.folders).toHaveLength(1);
    expect(data.folders[0].name).toBe("Docs");
  });
});

describe("Phase 8: orphaned and broken references", () => {
  it("loads with blocks whose pageIds are all missing", () => {
    const page = newPage(ws.id, "P", null);
    const orphan1 = newBlock("ghost-1", "paragraph", "lost1");
    const orphan2 = newBlock("ghost-2", "heading1", "lost2");
    const { data } = sanitizeLoadedData({
      workspace: ws,
      pages: [page],
      blocks: [orphan1, orphan2],
    });
    expect(data.blocks).toEqual([]);
  });

  it("loads with some blocks orphaned and some valid", () => {
    const page = newPage(ws.id, "P", null);
    const valid = newBlock(page.id, "paragraph", "here");
    const orphan = newBlock("missing", "paragraph", "gone");
    const { data } = sanitizeLoadedData({
      workspace: ws,
      pages: [page],
      blocks: [valid, orphan],
    });
    expect(data.blocks).toHaveLength(1);
    expect(data.blocks[0].content).toBe("here");
  });

  it("loads with 50 duplicate block ids", () => {
    const page = newPage(ws.id, "P", null);
    const blocks = Array.from({ length: 50 }, (_, i) => {
      const b = newBlock(page.id, "paragraph", `block ${i}`);
      b.id = "dup-id"; // all same id
      return b;
    });
    const { data, issues } = sanitizeLoadedData({
      workspace: ws,
      pages: [page],
      blocks,
    });
    expect(data.blocks).toHaveLength(50);
    expect(new Set(data.blocks.map((b) => b.id)).size).toBe(50);
    expect(issues.join()).toContain("duplicate block ids");
  });

  it("loads with duplicate page ids and duplicate folder ids simultaneously", () => {
    const pages = [
      { ...newPage(ws.id, "A", null), id: "dup" },
      { ...newPage(ws.id, "B", null), id: "dup" },
      { ...newPage(ws.id, "C", null), id: "dup" },
    ];
    const folders = [
      { ...newFolder(ws.id, "F1", null), id: "fdup" },
      { ...newFolder(ws.id, "F2", null), id: "fdup" },
    ];
    const { data, issues } = sanitizeLoadedData({ workspace: ws, pages, folders });
    expect(new Set(data.pages.map((p) => p.id)).size).toBe(3);
    expect(new Set(data.folders.map((f) => f.id)).size).toBe(2);
    expect(issues.join()).toContain("duplicate");
  });
});

describe("Phase 8b-j: field-level corruption", () => {
  it("loads with blocks having missing required fields (no id, no pageId)", () => {
    const page = newPage(ws.id, "P", null);
    const errors: string[] = [];
    const block = validateBlock({ type: "paragraph", content: "hi" }, errors);
    expect(block).not.toBeNull();
    expect(block?.pageId).toBeTruthy();
    expect(block?.id).toBeTruthy();
  });

  it("loads with blocks having indent=-5 and indent=999", () => {
    const errors: string[] = [];
    const neg = validateBlock({ id: "b1", pageId: "p1", type: "paragraph", content: "x", indent: -5 }, errors);
    expect(neg?.indent).toBe(0);
    const big = validateBlock({ id: "b2", pageId: "p1", type: "paragraph", content: "x", indent: 999 }, errors);
    expect(big?.indent).toBe(10);
  });

  it("loads with blocks having null content", () => {
    const errors: string[] = [];
    const block = validateBlock({ id: "b1", pageId: "p1", type: "paragraph", content: null }, errors);
    expect(block?.content).toBe("");
  });

  it("loads with blocks having rich spans pointing beyond content length", () => {
    const errors: string[] = [];
    const block = validateBlock({
      id: "b1",
      pageId: "p1",
      type: "paragraph",
      content: "hi",
      rich: [{ from: 0, to: 9999, bold: true }],
    }, errors);
    expect(block).not.toBeNull();
    expect(block?.rich).toBeDefined();
    expect(block!.rich![0].to).toBeLessThanOrEqual(2);
  });

  it("loads with tasks having null title and null text fields", () => {
    const errors: string[] = [];
    const task = validateTask({ id: "t1", title: null, notes: null, workspaceId: "main" }, errors);
    expect(task).not.toBeNull();
    expect(task?.title).toBe("Untitled");
    expect(task?.notes).toBe("");
  });

  it("loads with tasks having invalid priority", () => {
    const errors: string[] = [];
    const task = validateTask({ id: "t1", workspaceId: "main", title: "x", priority: 99 }, errors);
    expect(task?.priority).toBe(0);
  });

  it("loads with tasks having invalid dueDate format", () => {
    const errors: string[] = [];
    const task1 = validateTask({ id: "t1", workspaceId: "main", title: "x", dueDate: "not-a-date" }, errors);
    expect(task1?.dueDate).toBeNull();
    const task2 = validateTask({ id: "t2", workspaceId: "main", title: "x", dueDate: "2025/01/01" }, errors);
    expect(task2?.dueDate).toBeNull();
    const task3 = validateTask({ id: "t3", workspaceId: "main", title: "x", dueDate: "2025-01-01" }, errors);
    expect(task3?.dueDate).toBe("2025-01-01");
  });

  it("loads with fileRefs missing required fields", () => {
    const errors: string[] = [];
    const file = validateFile({ id: "f1", workspaceId: "main" }, errors);
    expect(file).not.toBeNull();
    expect(file?.name).toBe("file");
    expect(file?.size).toBe(0);
    expect(file?.kind).toBe("other");
  });

  it("loads with fileRefs having null data", () => {
    const errors: string[] = [];
    const file = validateFile({ id: "f1", workspaceId: "main", name: "test.pdf", data: null }, errors);
    expect(file).not.toBeNull();
    expect(file?.data).toBeNull();
  });

  it("loads with pages having unknown extra fields (tolerated)", () => {
    const errors: string[] = [];
    const page = validatePage({ id: "p1", workspaceId: "main", title: "X", createdAt: 1, updatedAt: 1, order: 0, favorite: false, parentId: null, folderId: null, icon: "", customField: "extra", nested: { a: 1 } }, errors);
    expect(page).not.toBeNull();
    expect(page?.title).toBe("X");
  });

  it("loads with settings having all fields missing", () => {
    const settings = validateSettings({}, "main");
    expect(settings).not.toBeNull();
    expect(settings?.theme).toBe("system");
    expect(settings?.editorFontSize).toBe(16);
    expect(settings?.editorSpacing).toBe("comfortable");
    expect(settings?.coverPreset).toBe("patina");
  });

  it("loads with settings having theme=null and fontSize=0", () => {
    const settings = validateSettings({ theme: null, editorFontSize: 0 }, "main");
    expect(settings?.theme).toBe("system");
    expect(settings?.editorFontSize).toBe(12);
  });

  it("loads with settings having fontSize=999", () => {
    const settings = validateSettings({ editorFontSize: 999 }, "main");
    expect(settings?.editorFontSize).toBe(22);
  });
});

describe("Phase 8k: block edge cases", () => {
  it("loads with table block rows being non-array", () => {
    const errors: string[] = [];
    const block = validateBlock({ id: "b1", pageId: "p1", type: "table", content: "", rows: "not-array" }, errors);
    expect(block).not.toBeNull();
    expect(block?.rows).toEqual([]);
  });

  it("loads with table block rows containing non-array inner rows", () => {
    const errors: string[] = [];
    const block = validateBlock({ id: "b1", pageId: "p1", type: "table", content: "", rows: ["bad", [1, 2], null] }, errors);
    expect(block).not.toBeNull();
    expect(block?.rows).toHaveLength(1);
  });

  it("loads with toggle block having collapsed=true", () => {
    const errors: string[] = [];
    const block = validateBlock({ id: "b1", pageId: "p1", type: "toggle", content: "T", collapsed: true }, errors);
    expect(block?.collapsed).toBe(true);
  });

  it("loads with toggle block having collapsed=false", () => {
    const errors: string[] = [];
    const block = validateBlock({ id: "b1", pageId: "p1", type: "toggle", content: "T", collapsed: false }, errors);
    expect(block?.collapsed).toBe(false);
  });

  it("loads with non-toggle block having collapsed field", () => {
    const errors: string[] = [];
    const block = validateBlock({ id: "b1", pageId: "p1", type: "paragraph", content: "x", collapsed: true }, errors);
    expect(block?.collapsed).toBeUndefined();
  });
});

describe("Phase 9: dedupeById at scale", () => {
  it("dedupes 50 blocks with 10 unique ids and 40 duplicates", () => {
    const blocks = Array.from({ length: 50 }, (_, i) => {
      const id = `block-${i % 10}`;
      return { id, pageId: "p1", type: "paragraph" as const, content: `${i}`, checked: false, indent: 0, rows: [], order: i, createdAt: i, updatedAt: i };
    });
    const reIded = dedupeById(blocks);
    expect(reIded).toBe(40);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(50);
  });

  it("dedupes 100 tasks with all same id", () => {
    const tasks = Array.from({ length: 100 }, (_, i) => ({
      id: "same",
      workspaceId: "main",
      title: `task ${i}`,
      notes: "",
      completed: false,
      priority: 0 as 0 | 1 | 2 | 3,
      dueDate: null,
      tags: [],
      favorite: false,
      createdAt: i,
      updatedAt: i,
    }));
    const reIded = dedupeById(tasks);
    expect(reIded).toBe(99);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(100);
  });
});

describe("Phase 9: repairRelationships stress", () => {
  it("handles 20 pages in a deep cycle chain", () => {
    const pages = Array.from({ length: 20 }, (_, i) => {
      const p = newPage(ws.id, `P${i}`, null);
      return p;
    });
    for (let i = 0; i < 19; i++) {
      pages[i].parentId = pages[i + 1].id;
    }
    pages[19].parentId = pages[0].id;
    const report = repairRelationships(pages, []);
    expect(report.cyclesBroken).toBeGreaterThan(0);
    expect(pages.every((p) => p.id !== p.parentId)).toBe(true);
  });

  it("handles 50 pages all pointing at orphan parent", () => {
    const pages = Array.from({ length: 50 }, (_, i) => {
      const p = newPage(ws.id, `P${i}`, null);
      p.parentId = "nonexistent-parent";
      return p;
    });
    const report = repairRelationships(pages, []);
    expect(report.orphansParented).toBe(50);
    expect(pages.every((p) => p.parentId === null)).toBe(true);
  });

  it("handles 30 folders with mixed cycles, orphans, and duplicates", () => {
    const folders = Array.from({ length: 30 }, (_, i) => ({
      id: i < 10 ? "dup" : `f${i}`,
      workspaceId: "main",
      name: `Folder ${i}`,
      icon: "",
      parentId: i === 0 ? "dup" : i < 5 ? `f${i - 1}` : i > 25 ? "ghost" : null,
      order: i,
      createdAt: i,
      updatedAt: i,
    }));
    const report = repairRelationships([], folders);
    expect(report.reIded).toBeGreaterThan(0);
    expect(report.cyclesBroken).toBeGreaterThan(0);
    expect(report.orphansParented).toBeGreaterThan(0);
    expect(new Set(folders.map((f) => f.id)).size).toBe(folders.length);
  });
});

describe("Phase 10: schema version edge cases", () => {
  it("schemaVersion=999 does not crash", () => {
    const base = { id: "main", name: "WS", createdAt: 1, updatedAt: 1, schemaVersion: 999 };
    const migrated = migrateWorkspace(base);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.name).toBe("WS");
  });

  it("schemaVersion=-1 coerces to 0 then migrates forward", () => {
    const base = { id: "main", name: "WS", createdAt: 1, updatedAt: 1, schemaVersion: -1 };
    const migrated = migrateWorkspace(base);
    expect(migrated.schemaVersion).toBe(2);
  });

  it("schemaVersion=3 (one ahead) resolves to current", () => {
    const base = { id: "main", name: "WS", createdAt: 1, updatedAt: 1, schemaVersion: 3 };
    const migrated = migrateWorkspace(base);
    expect(migrated.schemaVersion).toBe(2);
  });

  it("schemaVersion=0 migrates to current", () => {
    const base = { id: "main", name: "WS", createdAt: 1, updatedAt: 1, schemaVersion: 0 };
    const migrated = migrateWorkspace(base);
    expect(migrated.schemaVersion).toBe(2);
  });

  it("schemaVersion='garbage' coerces to 0 then migrates", () => {
    const base = { id: "main", name: "WS", createdAt: 1, updatedAt: 1, schemaVersion: "garbage" as unknown as number };
    const migrated = migrateWorkspace(base);
    expect(migrated.schemaVersion).toBe(2);
  });

  it("schemaVersion=Infinity coerces to 0 then migrates", () => {
    const base = { id: "main", name: "WS", createdAt: 1, updatedAt: 1, schemaVersion: Infinity };
    const migrated = migrateWorkspace(base);
    expect(migrated.schemaVersion).toBe(2);
  });

  it("schemaVersion=-Infinity coerces to 0 then migrates", () => {
    const base = { id: "main", name: "WS", createdAt: 1, updatedAt: 1, schemaVersion: -Infinity };
    const migrated = migrateWorkspace(base);
    expect(migrated.schemaVersion).toBe(2);
  });
});

describe("Phase 10: migrateBlocks edge cases", () => {
  it("migrates blocks with mixed types and various calloutType values", () => {
    const blocks = [
      { ...newBlock("p1", "callout", "x"), calloutType: "invalid" as never },
      { ...newBlock("p1", "code", "x"), language: 123 as unknown as string },
      { ...newBlock("p1", "paragraph", "x"), calloutType: "tip" as never, language: "python" as never },
      { ...newBlock("p1", "divider", "") },
    ];
    const migrated = migrateBlocks(blocks);
    expect(migrated[0].calloutType).toBe("note");
    expect(migrated[1].language).toBe("");
    expect(migrated[2].calloutType).toBeUndefined();
    expect(migrated[2].language).toBeUndefined();
    expect(migrated[3].calloutType).toBeUndefined();
    expect(migrated[3].language).toBeUndefined();
  });

  it("preserves block ids through migration", () => {
    const block = newBlock("p1", "paragraph", "test");
    const originalId = block.id;
    const [migrated] = migrateBlocks([block]);
    expect(migrated.id).toBe(originalId);
  });
});

describe("Phase 16-17: large workspace load", () => {
  it("loads 100 pages with 10 blocks each (1000 blocks total)", () => {
    const pages = Array.from({ length: 100 }, (_, i) => newPage(ws.id, `Page ${i}`, null));
    const blocks = pages.flatMap((p) =>
      Array.from({ length: 10 }, (_, j) => newBlock(p.id, "paragraph", `content-${j}`))
    );
    const tasks = Array.from({ length: 200 }, (_, i) => newTask(ws.id, `task-${i}`));

    const { data, issues } = sanitizeLoadedData({ workspace: ws, pages, blocks, tasks });
    expect(data.pages).toHaveLength(100);
    expect(data.blocks).toHaveLength(1000);
    expect(data.tasks).toHaveLength(200);
  });

  it("loads workspace with 1000 tasks without error", () => {
    const tasks = Array.from({ length: 1000 }, (_, i) => ({
      id: `task-${i}`,
      workspaceId: "main",
      title: `Task ${i}`,
      notes: `Notes for task ${i}`,
      completed: i % 2 === 0,
      priority: (i % 4) as 0 | 1 | 2 | 3,
      dueDate: "2025-06-15",
      tags: [`tag-${i % 5}`],
      favorite: i % 10 === 0,
      createdAt: i,
      updatedAt: i,
    }));
    const { data } = sanitizeLoadedData({ workspace: ws, tasks });
    expect(data.tasks).toHaveLength(1000);
  });

  it("loads 50 pages with folders and files (150 entities total)", () => {
    const folders = Array.from({ length: 10 }, (_, i) => newFolder(ws.id, `Folder ${i}`, null));
    const pages = Array.from({ length: 50 }, (_, i) => {
      const p = newPage(ws.id, `Page ${i}`, null);
      p.folderId = folders[i % folders.length].id;
      return p;
    });
    const files = Array.from({ length: 90 }, (_, i) => newFileRef(ws.id, `file-${i}.png`, 1024, "image/png", "image", `bk-${i}`));
    const { data } = sanitizeLoadedData({ workspace: ws, pages, folders, files });
    expect(data.pages).toHaveLength(50);
    expect(data.folders).toHaveLength(10);
    expect(data.files).toHaveLength(90);
  });
});

describe("Phase 16: multi-corruption stress", () => {
  it("loads with duplicate page ids + orphan blocks + garbage blocks + cycle pages simultaneously", () => {
    const page1 = { ...newPage(ws.id, "A", null), id: "shared" };
    const page2 = { ...newPage(ws.id, "B", null), id: "shared" };
    const page3 = newPage(ws.id, "C", null);
    page3.parentId = "nonexistent";
    const validBlock = newBlock("shared", "paragraph", "valid");
    const orphanBlock = newBlock("ghost", "paragraph", "orphan");
    const garbageBlock = { type: "hologram", pageId: "shared" };
    const { data, issues } = sanitizeLoadedData({
      workspace: ws,
      pages: [page1, page2, page3],
      blocks: [validBlock, orphanBlock, garbageBlock],
    });
    expect(data.pages).toHaveLength(3);
    expect(new Set(data.pages.map((p) => p.id)).size).toBe(3);
    expect(data.blocks).toHaveLength(1);
    expect(issues.length).toBeGreaterThan(0);
  });
});
