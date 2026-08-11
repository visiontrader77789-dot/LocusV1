"use client";

import { useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store/app";
import { navigate } from "@/lib/store/router";
import type { FileKind, FileRef } from "@/lib/core/types";
import { formatBytes, relativeTime, normalize } from "@/lib/core/util";
import { EmptyState } from "@/components/primitives";
import {
  IconDownload, IconFileArchive, IconFileAudio, IconFileImage, IconFileOther,
  IconFileText, IconFileVideo, IconPage, IconSearch, IconStar, IconStarFilled, IconTrash, IconUpload,
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

export function FilesView() {
  const { files, addFiles, fileKindCounts, pushNotice } = useApp();
  const [kind, setKind] = useState<FileKind | "all">("all");
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const q = normalize(query);
    return files
      .filter((f) => (kind === "all" ? true : f.kind === kind))
      .filter((f) => (q ? normalize(f.name).includes(q) : true))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [files, kind, query]);

  const pickFiles = () => fileRef.current?.click();

  return (
    <div className="max-w-[820px] mx-auto px-4 sm:px-6 py-8">
      <header className="mb-5">
        <h1 className="font-display font-semibold tracking-tight text-[26px] leading-tight">Files</h1>
        <p className="mt-1 text-[13px] text-ink-2">
          {files.length} file{files.length !== 1 ? "s" : ""} stored on this device
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
          onClick={pickFiles}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-accent text-accent-ink text-[13px] font-medium hover:bg-accent-hi transition-colors"
        >
          <IconUpload size={14} />
          Upload
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-3">
        {KIND_META.map((k) => {
          const count = k.kind === "all" ? files.length : fileKindCounts[k.kind];
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
          title={files.length === 0 ? "No files yet" : "Nothing matches"}
          body={files.length === 0 ? "Upload images, documents, audio and more. Files are stored locally." : "Try a different filter or search."}
          action={
            files.length === 0 ? (
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
            void addFiles(fs).then((added) => {
              if (added.length) pushNotice("success", `${added.length} file${added.length > 1 ? "s" : ""} added`);
            });
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
