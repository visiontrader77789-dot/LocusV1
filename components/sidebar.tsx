"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store/app";
import { navigate, type Route } from "@/lib/store/router";
import { onSidebarToggle } from "@/lib/store/events";
import { buildWorkspaceTree, collectDescendants, folderAncestry, sortFolders, sortPages } from "@/lib/core/tree";
import { formatShortcut } from "@/lib/shortcuts/platform";
import type { Folder, ID, Page, WorkspaceNode } from "@/lib/core/types";
import { LocusMark } from "@/components/mark";
import { Menu, MenuItem, MenuSeparator } from "@/components/primitives";
import { EmojiPicker } from "@/components/emoji-picker";
import {
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconCopy,
  IconFiles,
  IconFolder,
  IconFolderPlus,
  IconHome,
  IconMore,
  IconPage,
  IconPen,
  IconPlus,
  IconSettings,
  IconStar,
  IconStarFilled,
  IconTasks,
  IconTrash,
} from "@/components/icons";

type DropWhere = "before" | "after" | "inside";

interface DropTarget {
  kind: "page" | "folder";
  id: string;
  where: DropWhere;
}

interface DragRef {
  id: string;
  kind: "page" | "folder";
}

const NAV = [
  { key: "dashboard", label: "Home", icon: IconHome, route: { name: "dashboard" } as Route },
  { key: "tasks", label: "Tasks", icon: IconTasks, route: { name: "tasks" } as Route },
  { key: "files", label: "Files", icon: IconFiles, route: { name: "files" } as Route },
  { key: "favorites", label: "Favorites", icon: IconStar, route: { name: "favorites" } as Route },
];

/** Folders flattened with depth, for "move to folder" menus. */
function flattenFolders(folders: Folder[], parentId: ID | null = null, depth = 0): Array<{ folder: Folder; depth: number }> {
  const out: Array<{ folder: Folder; depth: number }> = [];
  for (const f of folders) {
    if (f.parentId !== parentId) continue;
    out.push({ folder: f, depth });
    out.push(...flattenFolders(folders, f.id, depth + 1));
  }
  return out;
}

interface WorkspaceRowProps {
  node: WorkspaceNode;
  depth: number;
  activeId: { kind: "page" | "folder"; id: string } | null;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  renaming: { kind: "page" | "folder"; id: string } | null;
  setRenaming: (r: { kind: "page" | "folder"; id: string } | null) => void;
  onNavigate: () => void;
  onDrop: (target: DropTarget) => void;
  onDragStart: (e: React.DragEvent, ref: DragRef) => void;
  dropTarget: DropTarget | null;
  onDragOverRow: (e: React.DragEvent, ref: { kind: "page" | "folder"; id: string }) => void;
  onDragLeaveRow: () => void;
}

function WorkspaceRow(props: WorkspaceRowProps) {
  const {
    node, depth, activeId, expanded, toggleExpand, renaming, setRenaming, onNavigate,
    onDrop, onDragStart, dropTarget, onDragOverRow, onDragLeaveRow,
  } = props;

  if (node.kind === "folder") return <FolderRow {...props} node={node} />;
  return <PageRow {...props} node={node} />;
}

function PageRow(props: WorkspaceRowProps & { node: Extract<WorkspaceNode, { kind: "page" }> }) {
  const {
    node, depth, activeId, expanded, toggleExpand, renaming, setRenaming, onNavigate,
    onDrop, onDragStart, dropTarget, onDragOverRow, onDragLeaveRow,
  } = props;
  const { page, children } = node;
  const {
    toggleFavoritePage, deletePage, duplicatePage, renamePage, confirm, movePage, pages, folders,
  } = useApp();
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(page.id);
  const isActive = activeId?.kind === "page" && activeId.id === page.id;
  const isDrop = dropTarget?.id === page.id;
  const [renameValue, setRenameValue] = useState(page.title);

  useEffect(() => {
    if (renaming?.kind === "page" && renaming.id === page.id) setRenameValue(page.title);
  }, [renaming, page.title, page.id]);

  const commitRename = () => {
    const v = renameValue.trim();
    if (v) void renamePage(page.id, v);
    setRenaming(null);
  };

  const handleDelete = () => {
    const descendants = collectDescendants(page.id, pages, true).length;
    confirm({
      title: "Delete this page?",
      body:
        descendants > 1
          ? `"${page.title}" and ${descendants - 1} nested page${descendants - 1 > 1 ? "s" : ""} will be deleted. Their tasks stay, but unlinked. This can't be undone.`
          : `"${page.title}" will be deleted. This can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => void deletePage(page.id),
    });
  };

  const moveToFolderItems = flattenFolders(folders);

  const dragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragOverRow(e, { kind: "page", id: page.id });
  };
  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDrop({ kind: "page", id: page.id, where: dropTarget?.id === page.id ? dropTarget!.where : "inside" });
  };

  const row = (
    <div
      className={`group relative flex items-center gap-1 pr-1.5 pl-1 py-[3px] rounded-[6px] cursor-pointer select-none transition-colors ${
        isActive ? "bg-accent-soft text-ink" : "hover:bg-surface-2 text-ink-2 hover:text-ink"
      } ${isDrop && dropTarget?.where === "inside" ? "bg-accent-soft ring-1 ring-inset ring-accent/40" : ""}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      draggable
      onDragStart={(e) => onDragStart(e, { id: page.id, kind: "page" })}
      onDragOver={dragOver}
      onDragLeave={onDragLeaveRow}
      onDrop={drop}
      onClick={() => {
        if (renaming?.kind === "page" && renaming.id === page.id) return;
        navigate({ name: "page", id: page.id });
        onNavigate();
      }}
      role="treeitem"
      aria-selected={isActive}
      aria-expanded={hasChildren ? isOpen : undefined}
    >
      {hasChildren ? (
        <button
          type="button"
          aria-label={isOpen ? "Collapse" : "Expand"}
          className="w-4 h-4 flex items-center justify-center text-ink-3 shrink-0 -ml-0.5"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand(page.id);
          }}
        >
          {isOpen ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}

      <span className="w-4 h-4 flex items-center justify-center text-[13px] shrink-0">
        {page.icon ? <span>{page.icon}</span> : <IconPage size={14} className="text-ink-3" />}
      </span>

      {renaming?.kind === "page" && renaming.id === page.id ? (
        <input
          autoFocus
          value={renameValue}
          className="flex-1 min-w-0 bg-transparent border border-accent rounded-[4px] px-1 text-[13px] text-ink focus:outline-none"
          onChange={(e) => setRenameValue(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(null);
          }}
        />
      ) : (
        <span className="flex-1 min-w-0 truncate text-[13px]">{page.title}</span>
      )}

      <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          aria-label={page.favorite ? "Remove favorite" : "Favorite"}
          className="icon-btn !w-5 !h-5"
          onClick={(e) => {
            e.stopPropagation();
            void toggleFavoritePage(page.id);
          }}
        >
          {page.favorite ? (
            <IconStarFilled size={13} className="text-accent" />
          ) : (
            <IconStar size={13} />
          )}
        </button>
        <div onClick={(e) => e.stopPropagation()}>
          <Menu
            width={196}
            trigger={() => (
              <span className="icon-btn !w-5 !h-5" role="button" aria-label="Page options">
                <IconMore size={14} />
              </span>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  leading={<IconPen size={13} />}
                  onClick={() => {
                    setRenaming({ kind: "page", id: page.id });
                    close();
                  }}
                >
                  Rename
                </MenuItem>
                <MenuItem
                  leading={<IconCopy size={13} />}
                  onClick={() => {
                    void duplicatePage(page.id);
                    close();
                  }}
                >
                  Duplicate
                </MenuItem>
                {page.parentId && (
                  <MenuItem
                    leading={<IconFolder size={13} />}
                    onClick={() => {
                      void movePage(page.id, null);
                      close();
                    }}
                  >
                    Move to top level
                  </MenuItem>
                )}
                <MenuSeparator />
                <MenuItem leading={<IconFolder size={13} />} onClick={() => close()}>
                  Move to folder
                </MenuItem>
                <div className="max-h-[180px] overflow-y-auto -mx-0.5 px-0.5">
                  <MenuItem
                    leading="~/"
                    onClick={() => {
                      void movePage(page.id, null, undefined, null);
                      close();
                    }}
                  >
                    Root (no folder)
                  </MenuItem>
                  {moveToFolderItems.map(({ folder, depth: d }) => (
                    <MenuItem
                      key={folder.id}
                      leading={<span className="w-4 text-center text-[12px]">{folder.icon || "📁"}</span>}
                      onClick={() => {
                        void movePage(page.id, null, undefined, folder.id);
                        close();
                      }}
                    >
                      <span className="inline-block" style={{ paddingLeft: d * 12 }}>
                        {folder.name || "untitled"}
                      </span>
                    </MenuItem>
                  ))}
                </div>
                <MenuSeparator />
                <MenuItem
                  leading={
                    page.favorite ? (
                      <IconStarFilled size={13} className="text-accent" />
                    ) : (
                      <IconStar size={13} />
                    )
                  }
                  onClick={() => {
                    void toggleFavoritePage(page.id);
                    close();
                  }}
                >
                  {page.favorite ? "Remove favorite" : "Add to favorites"}
                </MenuItem>
                <MenuItem danger leading={<IconTrash size={13} />} onClick={() => { close(); handleDelete(); }}>
                  Delete
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </span>

      {isDrop && dropTarget?.where === "before" && (
        <span className="absolute left-1 right-1 top-0 h-[2px] rounded-full bg-accent pointer-events-none" />
      )}
      {isDrop && dropTarget?.where === "after" && (
        <span className="absolute left-1 right-1 bottom-0 h-[2px] rounded-full bg-accent pointer-events-none" />
      )}
    </div>
  );

  return (
    <>
      {row}
      {hasChildren && isOpen && (
        <div>
          {children.map((child) => (
            <WorkspaceRow
              key={child.kind === "page" ? child.page.id : child.folder.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              expanded={expanded}
              toggleExpand={toggleExpand}
              renaming={renaming}
              setRenaming={setRenaming}
              onNavigate={onNavigate}
              onDrop={onDrop}
              onDragStart={onDragStart}
              dropTarget={dropTarget}
              onDragOverRow={onDragOverRow}
              onDragLeaveRow={onDragLeaveRow}
            />
          ))}
        </div>
      )}
    </>
  );
}

function FolderRow(props: WorkspaceRowProps & { node: Extract<WorkspaceNode, { kind: "folder" }> }) {
  const {
    node, depth, activeId, expanded, toggleExpand, renaming, setRenaming, onNavigate,
    onDrop, onDragStart, dropTarget, onDragOverRow, onDragLeaveRow,
  } = props;
  const { folder, children } = node;
  const { createPage, createFolder, renameFolder, setFolderIcon, deleteFolder, moveFolder, confirm } = useApp();
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(folder.id);
  const isActive = activeId?.kind === "folder" && activeId.id === folder.id;
  const isDrop = dropTarget?.id === folder.id;
  const [renameValue, setRenameValue] = useState(folder.name);
  const [iconPicker, setIconPicker] = useState(false);

  useEffect(() => {
    if (renaming?.kind === "folder" && renaming.id === folder.id) setRenameValue(folder.name);
  }, [renaming, folder.name, folder.id]);

  const commitRename = () => {
    const v = renameValue.trim();
    if (v) void renameFolder(folder.id, v);
    setRenaming(null);
  };

  const handleDelete = () => {
    confirm({
      title: "Delete this folder?",
      body: `"${folder.name || "Untitled"}" will be removed. Its pages, files and subfolders move up into the parent folder — nothing is deleted.`,
      confirmLabel: "Delete folder",
      danger: true,
      onConfirm: () => void deleteFolder(folder.id),
    });
  };

  const dragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragOverRow(e, { kind: "folder", id: folder.id });
  };
  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDrop({ kind: "folder", id: folder.id, where: dropTarget?.id === folder.id ? dropTarget!.where : "inside" });
  };

  const row = (
    <div
      className={`group relative flex items-center gap-1 pr-1.5 pl-1 py-[3px] rounded-[6px] cursor-pointer select-none transition-colors ${
        isActive ? "bg-accent-soft text-ink" : "hover:bg-surface-2 text-ink-2 hover:text-ink"
      } ${isDrop && dropTarget?.where === "inside" ? "bg-accent-soft ring-1 ring-inset ring-accent/40" : ""}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      draggable
      onDragStart={(e) => onDragStart(e, { id: folder.id, kind: "folder" })}
      onDragOver={dragOver}
      onDragLeave={onDragLeaveRow}
      onDrop={drop}
      onClick={() => {
        if (renaming?.kind === "folder" && renaming.id === folder.id) return;
        if (!isOpen) toggleExpand(folder.id);
        navigate({ name: "folder", id: folder.id });
        onNavigate();
      }}
      role="treeitem"
      aria-selected={isActive}
      aria-expanded={hasChildren ? isOpen : undefined}
    >
      {hasChildren ? (
        <button
          type="button"
          aria-label={isOpen ? "Collapse" : "Expand"}
          className="w-4 h-4 flex items-center justify-center text-ink-3 shrink-0 -ml-0.5"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand(folder.id);
          }}
        >
          {isOpen ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}

      <span className="w-4 h-4 flex items-center justify-center text-[13px] shrink-0">
        {folder.icon ? <span>{folder.icon}</span> : <IconFolder size={14} className="text-ink-3" />}
      </span>

      {renaming?.kind === "folder" && renaming.id === folder.id ? (
        <input
          autoFocus
          value={renameValue}
          className="flex-1 min-w-0 bg-transparent border border-accent rounded-[4px] px-1 text-[13px] text-ink focus:outline-none"
          onChange={(e) => setRenameValue(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(null);
          }}
        />
      ) : (
        <span className="flex-1 min-w-0 truncate text-[13px]">{folder.name || "untitled"}</span>
      )}

      <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <div onClick={(e) => e.stopPropagation()}>
          <Menu
            width={196}
            trigger={() => (
              <span className="icon-btn !w-5 !h-5" role="button" aria-label="Folder options">
                <IconMore size={14} />
              </span>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  leading={<IconPage size={13} />}
                  onClick={() => {
                    void createPage(null, undefined, folder.id).then((p) => navigate({ name: "page", id: p.id }));
                    close();
                  }}
                >
                  New page here
                </MenuItem>
                <MenuItem
                  leading={<IconFolderPlus size={13} />}
                  onClick={() => {
                    void createFolder(folder.id);
                    if (!isOpen) toggleExpand(folder.id);
                    close();
                  }}
                >
                  New subfolder
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  leading={<IconPen size={13} />}
                  onClick={() => {
                    setRenaming({ kind: "folder", id: folder.id });
                    close();
                  }}
                >
                  Rename
                </MenuItem>
                <MenuItem
                  leading={<IconStar size={13} />}
                  onClick={() => {
                    setIconPicker(true);
                    close();
                  }}
                >
                  Change icon
                </MenuItem>
                {folder.parentId && (
                  <MenuItem
                    leading={<IconChevronUp size={13} />}
                    onClick={() => {
                      void moveFolder(folder.id, null);
                      close();
                    }}
                  >
                    Move to top level
                  </MenuItem>
                )}
                <MenuSeparator />
                <MenuItem danger leading={<IconTrash size={13} />} onClick={() => { close(); handleDelete(); }}>
                  Delete
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </span>

      {isDrop && dropTarget?.where === "before" && (
        <span className="absolute left-1 right-1 top-0 h-[2px] rounded-full bg-accent pointer-events-none" />
      )}
      {isDrop && dropTarget?.where === "after" && (
        <span className="absolute left-1 right-1 bottom-0 h-[2px] rounded-full bg-accent pointer-events-none" />
      )}

      {iconPicker && (
        <EmojiPicker
          onPick={(char) => void setFolderIcon(folder.id, char)}
          onClose={() => setIconPicker(false)}
        />
      )}
    </div>
  );

  return (
    <>
      {row}
      {hasChildren && isOpen && (
        <div>
          {children.map((child) => (
            <WorkspaceRow
              key={child.kind === "page" ? child.page.id : child.folder.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              expanded={expanded}
              toggleExpand={toggleExpand}
              renaming={renaming}
              setRenaming={setRenaming}
              onNavigate={onNavigate}
              onDrop={onDrop}
              onDragStart={onDragStart}
              dropTarget={dropTarget}
              onDragOverRow={onDragOverRow}
              onDragLeaveRow={onDragLeaveRow}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function Sidebar({
  route,
  onNavigate,
}: {
  route: Route;
  onNavigate?: () => void;
}) {
  const { tree, folders, pages, createPage, createFolder, movePage, moveFolder, workspace, favorites } = useApp();
  const workspaceTree = useMemo(() => buildWorkspaceTree(pages, folders), [pages, folders]);
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>();
    if (route.name === "page") {
      let cur = pages.find((p) => p.id === route.id);
      const guard = new Set<string>();
      while (cur?.parentId && !guard.has(cur.id)) {
        guard.add(cur.id);
        const pid = cur.parentId;
        init.add(pid);
        cur = pages.find((p) => p.id === pid);
      }
    }
    if (route.name === "folder") {
      for (const f of folderAncestry(route.id, folders)) init.add(f.id);
    }
    for (const root of tree) if (root.children.length > 0) init.add(root.page.id);
    for (const root of buildWorkspaceTree(pages, folders)) if (root.children.length > 0) init.add(root.kind === "page" ? root.page.id : root.folder.id);
    return init;
  });
  const [renaming, setRenaming] = useState<{ kind: "page" | "folder"; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragRef = useRef<DragRef | null>(null);
  const dragTimer = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("locus:sidebar-collapsed");
      if (saved === "1") setCollapsed(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("locus:sidebar-collapsed", collapsed ? "1" : "0");
    } catch { /* ignore */ }
  }, [collapsed]);

  // "Toggle sidebar" shortcut.
  useEffect(() => onSidebarToggle(() => setCollapsed((c) => !c)), []);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const activeId = useMemo(
    () =>
      route.name === "page"
        ? { kind: "page" as const, id: route.id }
        : route.name === "folder"
          ? { kind: "folder" as const, id: route.id }
          : null,
    [route],
  );

  const siblingsByParent = useMemo(() => {
    const map = new Map<string | null, Page[]>();
    for (const p of pages) {
      const list = map.get(p.parentId);
      if (list) list.push(p);
      else map.set(p.parentId, [p]);
    }
    for (const [k, v] of map) map.set(k, sortPages(v));
    return map;
  }, [pages]);

  const folderSiblingsByParent = useMemo(() => {
    const map = new Map<string | null, Folder[]>();
    for (const f of folders) {
      const list = map.get(f.parentId);
      if (list) list.push(f);
      else map.set(f.parentId, [f]);
    }
    for (const [k, v] of map) map.set(k, sortFolders(v));
    return map;
  }, [folders]);

  const handleDrop = useCallback(
    (target: DropTarget) => {
      const dragged = dragRef.current;
      dragRef.current = null;
      setDropTarget(null);
      if (!dragged || (dragged.id === target.id && dragged.kind === target.kind)) return;

      // Folder dropped onto a page is not a valid move.
      if (dragged.kind === "folder" && target.kind === "page") return;

      if (dragged.kind === "folder" && target.kind === "folder") {
        const targetFolder = folders.find((f) => f.id === target.id);
        if (!targetFolder) return;
        let parentId: ID | null;
        let beforeId: ID | undefined;
        if (target.where === "inside") {
          parentId = targetFolder.id;
        } else {
          parentId = targetFolder.parentId;
          if (target.where === "before") {
            beforeId = targetFolder.id;
          } else {
            const sibs = folderSiblingsByParent.get(targetFolder.parentId) ?? [];
            const idx = sibs.findIndex((s) => s.id === targetFolder.id);
            const nextSibling = idx >= 0 ? sibs[idx + 1] : undefined;
            beforeId = nextSibling?.id;
          }
        }
        void moveFolder(dragged.id, parentId, beforeId);
        return;
      }

      // Page dropped on a folder → move into the folder (top level within it).
      if (target.kind === "folder") {
        void movePage(dragged.id, null, undefined, target.id);
        return;
      }

      // Page dropped on a page.
      const targetPage = pages.find((p) => p.id === target.id);
      if (!targetPage) return;
      let parentId: ID | null;
      let beforeId: ID | undefined;
      if (target.where === "inside") {
        parentId = targetPage.id;
      } else if (target.where === "before") {
        parentId = targetPage.parentId;
        beforeId = targetPage.id;
      } else {
        parentId = targetPage.parentId;
        const siblings = siblingsByParent.get(targetPage.parentId) ?? [];
        const idx = siblings.findIndex((s) => s.id === targetPage.id);
        const nextSibling = idx >= 0 ? siblings[idx + 1] : undefined;
        beforeId = nextSibling?.id;
      }
      void movePage(dragged.id, parentId, beforeId);
    },
    [pages, folders, siblingsByParent, folderSiblingsByParent, movePage, moveFolder],
  );

  const onDragStart = (e: React.DragEvent, ref: DragRef) => {
    dragRef.current = ref;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", ref.id);
  };

  const onDragOverRow = (e: React.DragEvent, ref: { kind: "page" | "folder"; id: string }) => {
    const dragged = dragRef.current;
    // Folders can't nest inside pages — show nothing there.
    if (dragged?.kind === "folder" && ref.kind === "page") {
      setDropTarget(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    let where: DropWhere = ratio < 0.3 ? "before" : ratio > 0.7 ? "after" : "inside";
    // Pages dropped on folders always land inside the folder.
    if (dragged?.kind === "page" && ref.kind === "folder") where = "inside";
    setDropTarget((prev) => (prev && prev.id === ref.id && prev.where === where ? prev : { kind: ref.kind, id: ref.id, where }));
  };

  const onDragLeaveRow = () => {
    if (dragTimer.current) window.clearTimeout(dragTimer.current);
    dragTimer.current = window.setTimeout(() => setDropTarget(null), 80);
  };

  const handleCreatePage = async (parentId: ID | null, folderId?: ID | null) => {
    const page = await createPage(parentId, undefined, folderId ?? null);
    navigate({ name: "page", id: page.id });
    if (parentId) toggleExpand(parentId);
    if (folderId) toggleExpand(folderId);
    onNavigate?.();
  };

  if (collapsed) {
    return (
      <aside className="hidden lg:flex flex-col items-center w-[52px] shrink-0 border-r border-line bg-surface py-3 gap-1">
        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center text-accent mb-2"
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
        >
          <LocusMark size={20} />
        </button>
        {NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-label={item.label}
            title={item.label}
            className={`w-8 h-8 flex items-center justify-center rounded-[6px] transition-colors ${
              route.name === item.key
                ? "bg-accent-soft text-accent"
                : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`}
            onClick={() => {
              navigate(item.route);
              onNavigate?.();
            }}
          >
            <item.icon size={16} />
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          className="w-8 h-8 flex items-center justify-center rounded-[6px] text-ink-2 hover:bg-surface-2 hover:text-ink"
          onClick={() => {
            navigate({ name: "settings" });
            onNavigate?.();
          }}
        >
          <IconSettings size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col w-[248px] shrink-0 border-r border-line bg-surface h-full">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <button
          type="button"
          className="flex items-center gap-2 group"
          onClick={() => {
            navigate({ name: "dashboard" });
            onNavigate?.();
          }}
          aria-label="Locus home"
        >
          <LocusMark size={17} className="text-accent" />
          <span className="font-display font-semibold tracking-[0.16em] text-[13px]">
            LOCUS
          </span>
        </button>
        <button
          type="button"
          className="hidden lg:inline-flex icon-btn"
          aria-label="Collapse sidebar"
          data-tip="Collapse"
          onClick={() => setCollapsed(true)}
        >
          <IconChevronRight size={14} />
        </button>
      </div>

      <nav className="px-2 mt-1.5 flex flex-col gap-0.5" aria-label="Main">
        {NAV.map((item) => {
          const isActive = route.name === item.key;
          const count =
            item.key === "favorites"
              ? favorites.pages.length + favorites.tasks.length + favorites.files.length
              : null;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                navigate(item.route);
                onNavigate?.();
              }}
              className={`flex items-center gap-2.5 h-8 px-2.5 rounded-[6px] text-[13px] transition-colors active:scale-[0.99] ${
                isActive
                  ? "bg-accent-soft text-accent font-medium"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <item.icon size={15} />
              <span className="flex-1 text-left">{item.label}</span>
              {count !== null && count > 0 && (
                <span className="font-mono text-[10px] text-ink-3">{count}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div
        className="flex-1 overflow-y-auto px-2 py-3"
        onDragOver={(e) => {
          e.preventDefault();
          setDropTarget(null);
        }}
        onDrop={(e) => {
          const dragged = dragRef.current;
          e.preventDefault();
          dragRef.current = null;
          setDropTarget(null);
          if (!dragged) return;
          if (dragged.kind === "folder") void moveFolder(dragged.id, null);
          else void movePage(dragged.id, null, undefined, null);
        }}
      >
        <div className="flex items-center justify-between px-1 mb-1">
          <span className="eyebrow">Workspace</span>
          <span className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="New folder"
              data-tip={`New folder (${formatShortcut({ key: "f", mod: true, alt: true })})`}
              className="icon-btn tooltip !w-6 !h-6"
              onClick={() => void createFolder(null)}
            >
              <IconFolderPlus size={13} />
            </button>
            <button
              type="button"
              aria-label="New page"
              data-tip={`New page (${formatShortcut({ key: "n", mod: true })})`}
              className="icon-btn tooltip !w-6 !h-6"
              onClick={() => void handleCreatePage(null)}
            >
              <IconPlus size={13} />
            </button>
          </span>
        </div>

        <div role="tree" aria-label="Workspace">
          {workspaceTree.map((node) => (
            <WorkspaceRow
              key={node.kind === "page" ? node.page.id : node.folder.id}
              node={node}
              depth={0}
              activeId={activeId}
              expanded={expanded}
              toggleExpand={toggleExpand}
              renaming={renaming}
              setRenaming={setRenaming}
              onNavigate={onNavigate ?? (() => {})}
              onDrop={handleDrop}
              onDragStart={onDragStart}
              dropTarget={dropTarget}
              onDragOverRow={onDragOverRow}
              onDragLeaveRow={onDragLeaveRow}
            />
          ))}
        </div>

        {workspaceTree.length === 0 && (
          <p className="px-1 pt-1 text-[12px] text-ink-3">
            Nothing here yet.
            <button
              type="button"
              className="text-accent hover:underline ml-1"
              onClick={() => void handleCreatePage(null)}
            >
              Create a page
            </button>
          </p>
        )}
      </div>

      <div className="border-t border-line px-3 py-2">
        <button
          type="button"
          className="flex items-center gap-2 w-full rounded-[6px] px-2 py-1.5 hover:bg-surface-2 transition-colors"
          onClick={() => {
            navigate({ name: "settings" });
            onNavigate?.();
          }}
          title="Workspace settings"
        >
          <span className="w-5 h-5 flex items-center justify-center rounded-[5px] bg-accent-soft text-accent">
            <IconFolder size={12} />
          </span>
          <span className="flex-1 text-left min-w-0">
            <span className="block text-[12.5px] font-medium truncate">{workspace?.name}</span>
            <span className="block font-mono text-[9.5px] text-accent uppercase tracking-[0.1em]">
              local
            </span>
          </span>
        </button>
      </div>
    </aside>
  );
}
