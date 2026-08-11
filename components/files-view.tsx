"use client";

import { useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store/app";
import { navigate } from "@/lib/store/router";
import type { FileKind, FileRef, Folder, ID } from "@/lib/core/types";
import { folderAncestry } from "@/lib/core/tree";
import { formatBytes, relativeTime, normalize } from "@/lib/core/util";
import { EmptyState, Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/primitives";
import { EmojiPicker } from "@/components/emoji-picker";
import {
  IconDownload, IconFileArchive, IconFileAudio, IconFileImage, IconFileOther,
  IconFileText, IconFileVideo, IconFolder, IconFolderPlus, IconMore,
  IconPage, IconPen, IconSearch, IconStar, IconStarFilled, IconTrash, IconUpload,
} from "@/components/icons";

const KIND_META: Array<{ kind: FileKind | "all"; label: string }> = [
  { kind: "all", label: "All" },
  { kind: "image", label: "Images" },
  { kind: "document", label: "Documents" },
  { kind: "audio", label: "Audio" },
  { kind: "video", label: "Video" },
  { kind: "archive", label: "Archives" },
  { kind: "other", label: "Other" },
];

function kindIcon(kind: FileKind) {
  switch (kind) {
    case "image": return IconFileImage;
    case "document": return IconFileText;
    case "audio": return IconFileAudio;
    case "video": return IconFileVideo;
    case "archive": return IconFileArchive;
    default: return IconFileOther;
  }
}

/** Folders flattened with depth, siblings grouped by parent. */
function flattenFolders(folders: Folder[], parentId: ID | null = null, depth = 0): Array<{ folder: Folder; depth: number }> {
  const out: Array<{ folder: Folder; depth: number }> = [];
  for (const f of folders) {
    if (f.parentId !== parentId) continue;
    out.push({ folder: f, depth });
    out.push(...flattenFolders(folders, f.id, depth + 1));
  }
  return out;
}

function MoveToMenu({ file }: { file: FileRef }) {
  const { folders, moveFile } = useApp();
  const items = flattenFolders(folders);
  return (
    <Menu
      align="end"
      width={220}
      trigger={() => (
        <button type="button" aria-label="Move to folder" className="icon-btn !w-6 !h-6" title="Move to folder">
          <IconFolder size={13} />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            leading="~/"
            onClick={() => { void moveFile(file.id, null); close(); }}
          >
            Root (no folder)
          </MenuItem>
          {items.length > 0 && <MenuSeparator />}
          {items.map(({ folder, depth }) => (
            <MenuItem
              key={folder.id}
              leading={<span className="w-4 text-center text-[12px]">{folder.icon || "📁"}</span>}
              onClick={() => { void moveFile(file.id, folder.id); close(); }}
            >
              <span className="inline-block" style={{ paddingLeft: depth * 12 }}>
                {folder.name || "untitled"}
              </span>
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  );
}

function FileRow({ file }: { file: FileRef }) {
  const { getFileBlob, deleteFile, renameFile, toggleFavoriteFile, pageById, confirm } = useApp();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(file.name);
  const page = file.pageId ? pageById.get(file.pageId) : undefined;
  const Icon = kindIcon(file.kind);

  const commitName = () => {
    const v = name.trim();
    if (v && v !== file.name) void renameFile(file.id, v);
    else setName(file.name);
    setRenaming(false);
  };

  const download = () => {
    void getFileBlob(file).then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
  };

  const handleDelete = () => {
    confirm({
      title: "Delete this file?",
      body: `"${file.name}" will be removed from your workspace. This can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => void deleteFile(file.id),
    });
  };

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 rounded-[6px] hover:bg-surface-2 transition-colors">
      <span className="w-9 h-9 shrink-0 flex items-center justify-center rounded-[8px] bg-surface-2 border border-line text-ink-3">
        <Icon size={16} />
      </span>

      <div className="flex-1 min-w-0">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") { setName(file.name); setRenaming(false); }
            }}
            className="w-full bg-transparent border border-accent rounded-[4px] px-1.5 py-0.5 text-[13.5px] focus:outline-none"
            aria-label="File name"
          />
        ) : (
          <div
            className="text-[13.5px] font-medium truncate"
            onDoubleClick={() => { setName(file.name); setRenaming(true); }}
            title="Double-click to rename"
          >
            {file.name}
          </div>
        )}
        <div className="flex items-center gap-2 font-mono text-[10.5px] text-ink-3">
          <span>{formatBytes(file.size)}</span>
          <span>·</span>
          <span>{relativeTime(file.createdAt)}</span>
          {page && (
            <button
              type="button"
              onClick={() => navigate({ name: "page", id: page.id })}
              className="inline-flex items-center gap-1 hover:text-accent transition-colors"
            >
              <IconPage size={11} />
              {page.icon && <span>{page.icon}</span>}
              {page.title}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <MoveToMenu file={file} />
        <button type="button" aria-label={file.favorite ? "Unfavorite" : "Favorite"} className="icon-btn !w-6 !h-6" onClick={() => void toggleFavoriteFile(file.id)}>
          {file.favorite ? <IconStarFilled size={13} className="text-warn" /> : <IconStar size={13} />}
        </button>
        <button type="button" aria-label="Download" className="icon-btn !w-6 !h-6" onClick={download}>
          <IconDownload size={13} />
        </button>
        <button type="button" aria-label="Delete" className="icon-btn !w-6 !h-6 hover:!bg-danger-soft hover:!text-danger" onClick={handleDelete}>
          <IconTrash size={13} />
        </button>
      </div>
    </div>
  );
}

function FolderCard({ folder }: { folder: Folder }) {
  const { folders, files, pages, createPage, createFolder, renameFolder, setFolderIcon, deleteFolder, confirm } = useApp();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.name);
  const [iconPicker, setIconPicker] = useState(false);

  const fileCount = files.filter((f) => f.folderId === folder.id).length;
  const folderCount = folders.filter((f) => f.parentId === folder.id).length;
  const pageCount = pages.filter((p) => p.folderId === folder.id).length;

  const commitName = () => {
    const v = name.trim();
    if (v && v !== folder.name) void renameFolder(folder.id, v);
    else setName(folder.name);
    setRenaming(false);
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

  return (
    <div className="group relative panel p-3.5 flex items-center gap-3 cursor-pointer hover:border-line-strong transition-colors"
      onClick={() => navigate({ name: "folder", id: folder.id })}>
      <span className="w-10 h-10 shrink-0 flex items-center justify-center rounded-[8px] bg-surface-2 border border-line text-[19px]">
        {folder.icon || "📁"}
      </span>
      <div className="flex-1 min-w-0">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") { setName(folder.name); setRenaming(false); }
            }}
            className="w-full bg-transparent border border-accent rounded-[4px] px-1.5 py-0.5 text-[13.5px] focus:outline-none"
            aria-label="Folder name"
          />
        ) : (
          <div className="text-[13.5px] font-medium truncate">{folder.name || "Untitled folder"}</div>
        )}
        <div className="text-[11px] text-ink-3">
          {fileCount > 0 && `${fileCount} file${fileCount !== 1 ? "s" : ""} · `}
          {pageCount > 0 && `${pageCount} page${pageCount !== 1 ? "s" : ""} · `}
          {folderCount > 0 && `${folderCount} subfolder${folderCount !== 1 ? "s" : ""}`}
          {fileCount + pageCount + folderCount === 0 && "Empty"}
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <Menu
          align="end"
          width={200}
          trigger={() => (
            <button type="button" aria-label="Folder options" className="icon-btn">
              <IconMore size={15} />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem leading={<IconPage size={14} />} onClick={() => { void createPage(null, undefined, folder.id).then((p) => navigate({ name: "page", id: p.id })); close(); }}>
                New page here
              </MenuItem>
              <MenuItem leading={<IconFolderPlus size={14} />} onClick={() => { void createFolder(folder.id); close(); }}>
                New subfolder
              </MenuItem>
              <MenuSeparator />
              <MenuItem leading={<IconPen size={14} />} onClick={() => { setRenaming(true); setName(folder.name); close(); }}>
                Rename
              </MenuItem>
              <MenuItem leading={<IconSearch size={14} />} onClick={() => { setIconPicker(true); close(); }}>
                Change icon
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger leading={<IconTrash size={14} />} onClick={handleDelete}>
                Delete
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
      {iconPicker && (
        <EmojiPicker
          onPick={(char) => void setFolderIcon(folder.id, char)}
          onClose={() => setIconPicker(false)}
        />
      )}
    </div>
  );
}

export function FilesView({ folderId }: { folderId?: string | null }) {
  const { folders, files, pages, folderById, addFiles, createFolder, createPage, pushNotice } = useApp();
  const [kind, setKind] = useState<FileKind | "all">("all");
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const current = folderId ? folderById.get(folderId) : undefined;
  const crumb = useMemo(() => (folderId ? folderAncestry(folderId, folders) : []), [folderId, folders]);

  const childFolders = useMemo(
    () =>
      folders
        .filter((f) => f.parentId === (folderId ?? null))
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [folders, folderId],
  );

  const folderFiles = useMemo(
    () => files.filter((f) => f.folderId === (folderId ?? null)),
    [files, folderId],
  );

  const folderPages = useMemo(
    () =>
      pages
        .filter((p) => p.folderId === (folderId ?? null) && !p.parentId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [pages, folderId],
  );

  const visible = useMemo(() => {
    const q = normalize(query);
    return folderFiles
      .filter((f) => (kind === "all" ? true : f.kind === kind))
      .filter((f) => (q ? normalize(f.name).includes(q) : true))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [folderFiles, kind, query]);

  const pickFiles = () => fileRef.current?.click();

  const title = current?.name || "Files";
  const total = folderFiles.length;
  const subCount = childFolders.length + folderPages.length;

  return (
    <div className="max-w-[820px] mx-auto px-4 sm:px-6 py-8">
      <header className="mb-5">
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-ink-3 mb-1 flex-wrap">
          <button
            type="button"
            onClick={() => navigate({ name: "files" })}
            className="hover:text-ink transition-colors"
          >
            ~/files
          </button>
          {crumb.map((f) => (
            <span key={f.id} className="flex items-center gap-1.5">
              <span className="text-ink-3">/</span>
              <button
                type="button"
                onClick={() => navigate({ name: "folder", id: f.id })}
                className="hover:text-ink transition-colors"
              >
                {f.icon ? `${f.icon} ` : ""}
                {f.name || "untitled"}
              </button>
            </span>
          ))}
        </div>
        <h1 className="font-display font-semibold tracking-tight text-[26px] leading-tight">
          {current?.icon ? `${current.icon} ` : ""}
          {title}
        </h1>
        <p className="mt-1 text-[13px] text-ink-2">
          {folderId
            ? `${total} file${total !== 1 ? "s" : ""} · ${subCount} item${subCount !== 1 ? "s" : ""} inside`
            : `${files.length} file${files.length !== 1 ? "s" : ""} stored on this device`}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex-1 min-w-[180px] flex items-center gap-2 px-3 h-9 rounded-[6px] border border-line bg-surface focus-within:border-accent transition-colors">
          <IconSearch size={14} className="text-ink-3 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name…"
            className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-3"
            aria-label="Filter files"
          />
        </div>
        <button
          type="button"
          onClick={() => void createFolder(folderId ?? null)}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] border border-line-strong bg-surface text-ink text-[13px] font-medium hover:bg-surface-2 transition-colors"
        >
          <IconFolderPlus size={14} />
          New folder
        </button>
        <button
          type="button"
          onClick={pickFiles}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-accent text-accent-ink text-[13px] font-medium hover:bg-accent-hi transition-colors"
        >
          <IconUpload size={14} />
          Upload
        </button>
      </div>

      {childFolders.length > 0 && (
        <div className="mb-6">
          <p className="eyebrow mb-2">Folders</p>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
            {childFolders.map((f) => (
              <FolderCard key={f.id} folder={f} />
            ))}
          </div>
        </div>
      )}

      {folderPages.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="eyebrow">Pages</p>
            <button
              type="button"
              onClick={() => void createPage(null, undefined, folderId ?? null).then((p) => navigate({ name: "page", id: p.id }))}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-[5px] text-[11.5px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
            >
              <IconPage size={12} />
              New page
            </button>
          </div>
          <div className="panel divide-y divide-line">
            {folderPages.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => navigate({ name: "page", id: page.id })}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-[6px] hover:bg-surface-2 transition-colors"
              >
                <span className="w-9 h-9 shrink-0 flex items-center justify-center rounded-[8px] bg-surface-2 border border-line text-[17px]">
                  {page.icon || <IconPage size={16} className="text-ink-3" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium truncate">{page.title || "Untitled"}</div>
                  <div className="text-[10.5px] text-ink-3 font-mono">{relativeTime(page.updatedAt)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 mb-3">
        {KIND_META.map((k) => {
          const count = k.kind === "all" ? total : folderFiles.filter((f) => f.kind === k.kind).length;
          const active = kind === k.kind;
          return (
            <button
              key={k.kind}
              type="button"
              disabled={count === 0}
              onClick={() => setKind(k.kind)}
              className={`h-7 px-2.5 rounded-[5px] text-[12.5px] transition-colors disabled:opacity-40 ${
                active ? "bg-accent-soft text-accent font-medium" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {k.label} {count}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={total === 0 ? (folderId ? "This folder is empty" : "No files yet") : "Nothing matches"}
          body={
            total === 0
              ? folderId
                ? "Upload files here, or drop them in from the root Files view."
                : "Upload images, documents, audio and more. Files are stored locally."
              : "Try a different filter or search."
          }
          action={
            total === 0 ? (
              <button type="button" onClick={pickFiles} className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] bg-accent text-accent-ink text-[13px] font-medium hover:bg-accent-hi transition-colors">
                <IconUpload size={14} />
                Upload a file
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="panel divide-y divide-line">
          {visible.map((file) => (
            <FileRow key={file.id} file={file} />
          ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          if (fs.length) {
            void addFiles(fs, folderId ?? null).then((added) => {
              if (added.length) pushNotice("success", `${added.length} file${added.length > 1 ? "s" : ""} added`);
            });
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
