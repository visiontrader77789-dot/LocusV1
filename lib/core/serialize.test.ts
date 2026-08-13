import { describe, expect, it } from "vitest";
import type { Folder, Page, Settings, Workspace } from "./types";
import { newBlock } from "./types";
import { archiveToText, buildArchive, parseLocusText } from "./serialize";

const workspace: Workspace = {
  id: "main",
  name: "Test",
  createdAt: 1,
  updatedAt: 1,
  schemaVersion: 2,
};

const settings: Settings = {
  id: "settings",
  workspaceId: "main",
  theme: "system",
  editorFontSize: 16,
  editorSpacing: "comfortable",
};

function folder(id: string, name: string, parentId: string | null = null): Folder {
  return {
    id,
    workspaceId: "main",
    name,
    icon: "",
    parentId,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

function page(id: string, title: string, folderId: string | null = null): Page {
  return {
    id,
    workspaceId: "main",
    title,
    icon: "",
    parentId: null,
    folderId,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    favorite: false,
  };
}

async function archiveWith(input: {
  pages?: Page[];
  folders?: Folder[];
}): Promise<string> {
  const archive = await buildArchive({
    workspace,
    settings,
    pages: input.pages ?? [],
    folders: input.folders ?? [],
    blocks: [],
    tasks: [],
    files: [],
    blobFor: async () => null,
  });
  return archiveToText(archive);
}

describe("folder archive round-trip", () => {
  it("preserves folder hierarchy and page folderId", async () => {
    const text = await archiveWith({
      pages: [page("p1", "Notes", "f2")],
      folders: [folder("f1", "Root"), folder("f2", "Inbox", "f1")],
    });
    const result = parseLocusText(text);
    expect(result.ok).toBe(true);
    expect(result.data?.folders.map((f) => [f.id, f.parentId])).toEqual([
      ["f1", null],
      ["f2", "f1"],
    ]);
    expect(result.data?.pages.find((p) => p.id === "p1")?.folderId).toBe("f2");
  });

  it("drops a folderId that points at a missing folder", async () => {
    const text = await archiveWith({
      pages: [page("p1", "Notes", "ghost")],
      folders: [folder("f1", "Root")],
    });
    const result = parseLocusText(text);
    expect(result.ok).toBe(true);
    expect(result.data?.pages.find((p) => p.id === "p1")?.folderId).toBeNull();
  });
});

describe("callout/code block archive round-trip", () => {
  it("preserves calloutType and code language across a backup", async () => {
    const callout = newBlock("p1", "callout", "Heads up");
    callout.calloutType = "warning";
    const code = newBlock("p1", "code", "x = 1");
    code.language = "python";
    const archive = await buildArchive({
      workspace,
      settings,
      pages: [page("p1", "Notes")],
      folders: [],
      blocks: [callout, code],
      tasks: [],
      files: [],
      blobFor: async () => null,
    });
    const result = parseLocusText(archiveToText(archive));
    expect(result.ok).toBe(true);
    const parsed = result.data?.blocks ?? [];
    expect(parsed.find((b) => b.type === "callout")?.calloutType).toBe("warning");
    expect(parsed.find((b) => b.type === "code")?.language).toBe("python");
  });
});
