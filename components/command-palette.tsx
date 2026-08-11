"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store/app";
import { searchIndex, groupResults, type SearchResult } from "@/lib/core/search";
import { navigate } from "@/lib/store/router";
import { closePalette, onPaletteClose, onPaletteOpen } from "@/lib/store/events";
import { requestShortcutsHelpFocus } from "@/lib/shortcuts/registry";
import { formatShortcut } from "@/lib/shortcuts/platform";
import { IconFiles, IconFolder, IconInfo, IconPage, IconSearch, IconTasks, IconUpload, IconX } from "@/components/icons";
import { LocusMark } from "@/components/mark";

type Mode = "search" | "task" | "page";

export function CommandPalette() {
  const {
    pages, tasks, files, blocks, folders,
    createTask, createPage, addFiles, pushNotice, updateTask,
  } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("search");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => onPaletteOpen((mode) => {
    setOpen(true);
    setMode(mode);
    setQuery("");
    setActive(0);
  }), []);
  useEffect(() => onPaletteClose(() => setOpen(false)), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); closePalette(); }
    };
    window.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const results = useMemo(() => {
    if (mode !== "search" || !query.trim()) return groupResults([]);
    return groupResults(
      searchIndex.query(query, pages, tasks, files, {
        folders,
        blockScan: () => blocks,
        limit: 14,
      }),
    );
  }, [mode, query, pages, tasks, files, blocks, folders]);

  const flat = useMemo(() => {
    const list: Array<{ label?: string; result?: SearchResult }> = [];
    const pushGroup = (label: string, rs: SearchResult[]) => {
      if (rs.length === 0) return;
      list.push({ label });
      for (const r of rs) list.push({ result: r });
    };
    pushGroup("Folders", results.folders);
    pushGroup("Pages", results.pages);
    pushGroup("Tasks", results.tasks);
    pushGroup("Files", results.files);
    pushGroup("Page content", results.content);
    return list;
  }, [results]);

  useEffect(() => {
    setActive(0);
  }, [query, mode]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const runResult = useCallback((r: SearchResult) => {
    if (r.kind === "folder") {
      setOpen(false);
      closePalette();
      navigate({ name: "folder", id: r.id });
    } else if (r.kind === "page") {
      setOpen(false);
      closePalette();
      navigate({ name: "page", id: r.id });
    } else if (r.kind === "block") {
      setOpen(false);
      closePalette();
      navigate({ name: "page", id: r.pageId! });
    } else if (r.kind === "file") {
      setOpen(false);
      closePalette();
      navigate({ name: "files" });
    } else if (r.kind === "task") {
      void updateTask(r.id, { completed: !(r.meta?.completed ?? false) });
    }
  }, [updateTask]);

  const submit = async () => {
    if (mode === "task") {
      const title = query.trim();
      if (title) {
        await createTask(title);
        pushNotice("success", "Task added");
      }
      setOpen(false);
      closePalette();
      return;
    }
    if (mode === "page") {
      const title = query.trim() || undefined;
      const page = await createPage(null, title);
      setOpen(false);
      closePalette();
      navigate({ name: "page", id: page.id });
      return;
    }
    const item = flat[active];
    if (item?.result) runResult(item.result);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  if (!open) return null;

  const quickActions = [
    {
      label: "New page",
      icon: <IconPage size={15} />,
      kbd: formatShortcut({ key: "n", mod: true }),
      run: () => { setMode("page"); setQuery(""); inputRef.current?.focus(); },
    },
    {
      label: "New task",
      icon: <IconTasks size={15} />,
      kbd: formatShortcut({ key: "n", mod: true, shift: true }),
      run: () => { setMode("task"); setQuery(""); inputRef.current?.focus(); },
    },
    {
      label: "Upload a file",
      icon: <IconUpload size={15} />,
      run: () => fileRef.current?.click(),
    },
    {
      label: "Open settings",
      icon: <IconFiles size={15} />,
      kbd: formatShortcut({ key: ",", mod: true }),
      run: () => { setOpen(false); closePalette(); navigate({ name: "settings" }); },
    },
    {
      label: "Keyboard shortcuts",
      icon: <IconInfo size={15} />,
      kbd: formatShortcut({ key: "/", mod: true }),
      run: () => { setOpen(false); closePalette(); requestShortcutsHelpFocus(); navigate({ name: "settings" }); },
    },
  ];

  const showQuick = mode === "search" && !query.trim();
  const showEmpty = mode === "search" && query.trim() && flat.length === 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 anim-fade" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 bg-black/35" onClick={() => { setOpen(false); closePalette(); }} aria-hidden="true" />
      <div className="relative w-full max-w-[560px] bg-surface border border-line rounded-[10px] shadow-[var(--shadow-3)] anim-pop overflow-hidden">
        <div className="flex items-center gap-2.5 px-3.5 h-12 border-b border-line">
          {mode === "search" ? (
            <IconSearch size={15} className="text-ink-3 shrink-0" />
          ) : mode === "task" ? (
            <IconTasks size={15} className="text-accent shrink-0" />
          ) : (
            <IconPage size={15} className="text-accent shrink-0" />
          )}
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3"
            placeholder={
              mode === "search"
                ? "Search pages, folders, tasks, files…"
                : mode === "task"
                  ? "Task title, then press Enter"
                  : "Page title, then press Enter"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search"
          />
          {mode === "search" && (
            <span className="font-mono text-[10px] text-ink-3 flex items-center gap-1">
              <LocusMark size={12} />
              esc
            </span>
          )}
          {mode !== "search" && (
            <button type="button" className="icon-btn !w-6 !h-6" aria-label="Back" onClick={() => { setMode("search"); setQuery(""); }}>
              <IconX size={13} />
            </button>
          )}
        </div>

        <div ref={listRef} className="max-h-[380px] overflow-y-auto p-1.5">
          {showQuick && (
            <div>
              <div className="px-2.5 pt-1.5 pb-1 eyebrow">Quick actions</div>
              {quickActions.map((qa) => (
                <button
                  key={qa.label}
                  type="button"
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-[13.5px] text-ink hover:bg-surface-2 transition-colors"
                  onClick={qa.run}
                >
                  <span className="text-ink-3">{qa.icon}</span>
                  <span className="flex-1 text-left">{qa.label}</span>
                  {qa.kbd && <span className="font-mono text-[10px] text-ink-3 shrink-0">{qa.kbd}</span>}
                </button>
              ))}
            </div>
          )}

          {showEmpty && (
            <div className="py-10 text-center">
              <p className="text-[13.5px] text-ink-3">Nothing found for “{query}”.</p>
              <p className="mt-1 text-[12px] text-ink-3">Search stays on your device.</p>
            </div>
          )}

          {flat.map((item, i) =>
            item.result ? (
              <button
                key={item.result.id}
                type="button"
                data-idx={i}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left transition-colors ${
                  i === active ? "bg-accent-soft" : "hover:bg-surface-2"
                }`}
                onMouseMove={() => setActive(i)}
                onClick={() => { if (item.result) runResult(item.result); }}
              >
                <span className={`w-4 h-4 shrink-0 flex items-center justify-center ${
                  item.result.kind === "page" ? "text-ink-3" : item.result.kind === "task" ? "text-accent" : item.result.kind === "file" ? "text-warn" : item.result.kind === "folder" ? "text-accent" : "text-ink-3"
                }`}>
                  {item.result.kind === "page" ? <IconPage size={14} /> : item.result.kind === "task" ? <IconTasks size={14} /> : item.result.kind === "file" ? <IconFiles size={14} /> : item.result.kind === "folder" ? <IconFolder size={14} /> : <LocusMark size={13} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] truncate text-ink">{item.result.title}</span>
                  {item.result.snippet && item.result.snippet !== item.result.title && (
                    <span className="block text-[11.5px] truncate text-ink-3">{item.result.snippet}</span>
                  )}
                </span>
                {item.result.kind === "task" && (
                  <span className="font-mono text-[10px] text-ink-3 shrink-0">
                    {item.result.meta?.completed ? "done" : "pending"}
                  </span>
                )}
              </button>
            ) : (
              <div key={item.label} className="px-2.5 pt-2 pb-1 eyebrow">{item.label}</div>
            ),
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []);
            if (fs.length) void addFiles(fs);
            e.target.value = "";
            setOpen(false);
            closePalette();
          }}
        />
      </div>
    </div>
  );
}
