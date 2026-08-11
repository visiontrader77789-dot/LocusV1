import { describe, expect, it } from "vitest";
import type { Folder, Page } from "./types";
import {
  applyFolderMove,
  applyMove,
  buildWorkspaceTree,
  collectFolderDescendants,
  folderAncestry,
  planFolderMove,
  planMove,
} from "./tree";

function folder(id: string, name = id, parentId: string | null = null): Folder {
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

function page(
  id: string,
  title = id,
  parentId: string | null = null,
  folderId: string | null = null,
): Page {
  return {
    id,
    workspaceId: "main",
    title,
    icon: "",
    parentId,
    folderId,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    favorite: false,
  };
}

describe("buildWorkspaceTree", () => {
  it("lists folders before pages at each level and nests pages in folders", () => {
    const folders = [folder("f1", "Alpha"), folder("f2", "Beta", "f1")];
    const pages = [
      page("p-root", "Root"),
      page("p-in-f2", "In Beta", null, "f2"),
      page("p-child", "Child", "p-in-f2", "f2"),
    ];
    const roots = buildWorkspaceTree(pages, folders);
    expect(roots.map((n) => (n.kind === "folder" ? n.folder.id : n.page.id))).toEqual(["f1", "p-root"]);

    const f1 = roots[0];
    if (f1.kind !== "folder") throw new Error("expected folder");
    expect(f1.children.map((n) => (n.kind === "folder" ? n.folder.id : n.page.id))).toEqual(["f2"]);

    const f2 = f1.children[0];
    if (f2.kind !== "folder") throw new Error("expected folder");
    expect(f2.children.map((n) => n.kind === "page" && n.page.id)).toEqual(["p-in-f2"]);

    const f2page = f2.children[0];
    if (f2page.kind !== "page") throw new Error("expected page");
    expect(f2page.children.map((n) => n.kind === "page" && n.page.id)).toEqual(["p-child"]);
  });

  it("sorts folders and pages by order", () => {
    const folders = [
      { ...folder("a", "Zeta"), order: 2 },
      { ...folder("b", "Alpha"), order: 1 },
    ];
    const roots = buildWorkspaceTree([], folders);
    expect(roots.map((n) => (n.kind === "folder" ? n.folder.name : ""))).toEqual(["Alpha", "Zeta"]);
  });
});

describe("collectFolderDescendants", () => {
  it("collects self and nested descendants", () => {
    const folders = [
      folder("a"),
      folder("b", "b", "a"),
      folder("c", "c", "b"),
    ];
    expect(collectFolderDescendants("a", folders, true).sort()).toEqual(["a", "b", "c"].sort());
    expect(collectFolderDescendants("a", folders, false).sort()).toEqual(["b", "c"].sort());
  });
});

describe("folderAncestry", () => {
  it("walks from root to the folder", () => {
    const folders = [folder("a"), folder("b", "b", "a"), folder("c", "c", "b")];
    expect(folderAncestry("c", folders).map((f) => f.id)).toEqual(["a", "b", "c"]);
  });
});

describe("planFolderMove", () => {
  it("blocks moving a folder into its own descendant", () => {
    const folders = [folder("a"), folder("b", "b", "a"), folder("c", "c", "b")];
    expect(planFolderMove("a", folders, "b")).toBeNull();
    expect(planFolderMove("a", folders, "c")).toBeNull();
    expect(planFolderMove("b", folders, "c")).toBeNull();
  });

  it("blocks moving a folder into itself", () => {
    const folders = [folder("a")];
    expect(planFolderMove("a", folders, "a")).toBeNull();
  });
});

describe("applyFolderMove", () => {
  it("reparents a folder", () => {
    const folders = [folder("a"), folder("b", "b", "a"), folder("c", "c", "a")];
    const next = applyFolderMove(folders, { folderId: "b", parentId: "c" });
    expect(next.find((f) => f.id === "b")?.parentId).toBe("c");
  });
});

describe("planMove / applyMove", () => {
  it("blocks moving a page under its own descendant", () => {
    const pages = [page("a", "A"), page("b", "B", "a")];
    expect(planMove("a", pages, "b")).toBeNull();
  });

  it("sets the folderId when moving a page into a folder", () => {
    const pages = [page("a", "A"), page("b", "B")];
    const move = planMove("a", pages, null, undefined, "f1");
    expect(move).not.toBeNull();
    const next = applyMove(pages, move!);
    expect(next.find((p) => p.id === "a")?.folderId).toBe("f1");
  });

  it("keeps the existing folderId when none is supplied", () => {
    const pages = [page("a", "A", null, "f1"), page("b", "B")];
    const move = planMove("a", pages, null, undefined, undefined);
    const next = applyMove(pages, move!);
    expect(next.find((p) => p.id === "a")?.folderId).toBe("f1");
  });
});
