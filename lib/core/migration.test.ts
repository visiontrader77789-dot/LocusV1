import { describe, expect, it } from "vitest";
import { migrateBlocks, migrateWorkspace } from "@/lib/core/migration";
import { newBlock } from "@/lib/core/types";
import type { Block } from "@/lib/core/types";

describe("migrateBlocks", () => {
  it("normalizes calloutType and language defaults", () => {
    const callout = newBlock("p1", "callout", "Note text");
    const code = newBlock("p1", "code", "console.log(1)");
    const migrated = migrateBlocks([callout, code]);

    expect(migrated[0].calloutType).toBe("note");
    expect(migrated[1].language).toBe("");
  });

  it("keeps valid calloutType and language values", () => {
    const callout = newBlock("p1", "callout", "Warning text");
    (callout as Partial<Block>).calloutType = "warning" as never;
    const code = newBlock("p1", "code", "x");
    (code as Partial<Block>).language = "typescript" as never;
    const migrated = migrateBlocks([callout, code]);

    expect(migrated[0].calloutType).toBe("warning");
    expect(migrated[1].language).toBe("typescript");
  });

  it("falls back to note for unknown callout types", () => {
    const callout = newBlock("p1", "callout", "hi");
    (callout as Partial<Block>).calloutType = "glow" as never;
    const [migrated] = migrateBlocks([callout]);
    expect(migrated.calloutType).toBe("note");
  });

  it("drops calloutType/language on non-matching block types", () => {
    const para = newBlock("p1", "paragraph", "hi");
    (para as Partial<Block>).calloutType = "tip" as never;
    (para as Partial<Block>).language = "python" as never;
    const [migrated] = migrateBlocks([para]);
    expect(migrated.calloutType).toBeUndefined();
    expect(migrated.language).toBeUndefined();
  });

  it("keeps other block fields intact", () => {
    const b = newBlock("p1", "todoList", "task");
    b.checked = true;
    b.indent = 2;
    const [migrated] = migrateBlocks([b]);
    expect(migrated.checked).toBe(true);
    expect(migrated.indent).toBe(2);
    expect(migrated.type).toBe("todoList");
  });
});

describe("migrateWorkspace schemaVersion handling", () => {
  const base = { id: "main", name: "WS", createdAt: 1, updatedAt: 1, schemaVersion: 2 };

  it("coerces a string schemaVersion to a number", () => {
    const migrated = migrateWorkspace({ ...base, schemaVersion: "2" as unknown as number });
    expect(migrated.schemaVersion).toBe(2);
  });

  it("coerces NaN schemaVersion to the current version", () => {
    const migrated = migrateWorkspace({ ...base, schemaVersion: Number.NaN });
    expect(migrated.schemaVersion).toBe(2);
  });

  it("coerces a missing schemaVersion to 0 then migrates forward", () => {
    const migrated = migrateWorkspace({ ...base, schemaVersion: undefined as unknown as number });
    expect(migrated.schemaVersion).toBe(2);
  });

  it("migrates an old version up to the current schema version", () => {
    const migrated = migrateWorkspace({ ...base, schemaVersion: 0 });
    expect(migrated.schemaVersion).toBe(2);
  });

  it("keeps a workspace already at the current version unchanged", () => {
    const migrated = migrateWorkspace({ ...base, schemaVersion: 2 });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.name).toBe("WS");
  });
});
