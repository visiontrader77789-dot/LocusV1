"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Block, BlockType, InlineSpan } from "@/lib/core/types";
import { newBlock } from "@/lib/core/types";
import { useApp } from "@/lib/store/app";
import { navigate } from "@/lib/store/router";
import { EditorBlock, type EditorHandlers } from "./block";
import { filterSlashItems, type SlashCommand } from "./slash-menu";
import {
  concatBlocks, matchBareMarker, matchDeferredBullet, matchMarkdown,
} from "@/lib/core/rich";
import { isoDate } from "@/lib/core/util";
import { onRequestBlockInsert } from "@/lib/store/events";

const TEXT_TYPES = new Set<BlockType>([
  "paragraph", "heading1", "heading2", "heading3",
  "bulletList", "numberedList", "todoList", "quote", "code", "callout", "toggle",
]);

function isTextType(t: BlockType): boolean {
  return TEXT_TYPES.has(t);
}

const HISTORY_LIMIT = 200;
const TEXT_COALESCE_MS = 900;

type ChangeKind = "text" | "structural";

/** Classify a committed change for undo coalescing. */
function classifyChange(prev: Block[], next: Block[]): ChangeKind | "none" {
  if (prev === next) return "none";
  if (prev.length !== next.length) return "structural";
  let textChanged = false;
  for (let i = 0; i < next.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (a === b) continue;
    if (
      a.id !== b.id ||
      a.type !== b.type ||
      a.checked !== b.checked ||
      a.attachmentId !== b.attachmentId ||
      a.indent !== b.indent ||
      a.calloutType !== b.calloutType ||
      a.language !== b.language ||
      a.rows !== b.rows ||
      a.collapsed !== b.collapsed ||
      a.order !== b.order
    ) {
      return "structural";
    }
    textChanged = true;
  }
  return textChanged ? "text" : "none";
}

export function Editor({ pageId }: { pageId: string }) {
  const {
    pages, files, blocksForPage, saveBlocks, updatePage,
    createPage, addFiles, attachFileToPage, getFileBlob, pushNotice,
  } = useApp();

  const [blocks, setBlocks] = useState<Block[]>(() => {
    const all = blocksForPage(pageId);
    return [...all].sort((a, b) => a.order - b.order);
  });

  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashActive, setSlashActive] = useState(0);
  const [caretTarget, setCaretTarget] = useState<{ id: string; at: "start" | "end"; seq: number; mode?: "highlight" | "link" } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ id: string; pos: "before" | "after" } | null>(null);
  const [pickKind, setPickKind] = useState<"image" | "file" | null>(null);

  // ---- live refs so stable handlers never read stale state ----------------
  const blocksRef = useRef<Block[]>(blocks);
  blocksRef.current = blocks;
  const focusedIdRef = useRef<string | null>(focusedBlockId);
  focusedIdRef.current = focusedBlockId;
  const slashRef = useRef({ query: slashQuery, active: slashActive });
  slashRef.current = { query: slashQuery, active: slashActive };
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const fileByIdRef = useRef(new Map(files.map((f) => [f.id, f])));
  fileByIdRef.current = new Map(files.map((f) => [f.id, f]));
  const draggingIdRef = useRef<string | null>(null);
  draggingIdRef.current = draggingId;
  const dragOverRef = useRef<{ id: string; pos: "before" | "after" } | null>(null);
  dragOverRef.current = dragOver;

  const seqRef = useRef(0);
  const commitTimer = useRef<number | null>(null);
  const latestBlocks = useRef<Block[]>(blocks);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Undo/redo history (snapshots of the block list).
  const undoStack = useRef<Block[][]>([]);
  const redoStack = useRef<Block[][]>([]);
  const lastChangeKind = useRef<ChangeKind | null>(null);
  const lastTextAt = useRef(0);

  // ---- persistence -------------------------------------------------------
  const push = (next: Block[]) => {
    setBlocks(next);
    blocksRef.current = next;
    latestBlocks.current = next;
    if (commitTimer.current) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = null;
      void saveBlocks(pageId, next);
      void updatePage({ id: pageId });
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (commitTimer.current) window.clearTimeout(commitTimer.current);
      void saveBlocks(pageId, latestBlocks.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // ---- undo/redo core -----------------------------------------------------
  const commit = (updater: (prev: Block[]) => Block[]) => {
    const prev = blocksRef.current;
    const next = updater(prev);
    if (next === prev) return;
    const kind = classifyChange(prev, next);
    if (kind === "none") return;
    const nowTs = Date.now();
    const coalescing =
      kind === "text" &&
      lastChangeKind.current === "text" &&
      nowTs - lastTextAt.current < TEXT_COALESCE_MS;
    if (undoStack.current.length === 0 || !coalescing) {
      undoStack.current.push(prev);
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
    }
    lastChangeKind.current = kind;
    if (kind === "text") lastTextAt.current = nowTs;
    redoStack.current = [];
    push(next);
  };

  const restoreCaret = (snapshot: Block[]) => {
    const fid = focusedIdRef.current;
    const focusedBlock = fid ? snapshot.find((b) => b.id === fid) : undefined;
    if (focusedBlock && isTextType(focusedBlock.type)) {
      requestFocus(fid as string, "end");
      return;
    }
    const firstText = snapshot.find((b) => isTextType(b.type));
    if (firstText) requestFocus(firstText.id, "end");
    else setFocusedBlockId(null);
  };

  const undoHistory = () => {
    const stack = undoStack.current;
    if (stack.length === 0) return;
    const snapshot = stack.pop()!;
    redoStack.current.push(blocksRef.current);
    lastChangeKind.current = null;
    lastTextAt.current = 0;
    closeSlash();
    push(snapshot);
    restoreCaret(snapshot);
  };

  const redoHistory = () => {
    const stack = redoStack.current;
    if (stack.length === 0) return;
    const snapshot = stack.pop()!;
    undoStack.current.push(blocksRef.current);
    lastChangeKind.current = null;
    lastTextAt.current = 0;
    closeSlash();
    push(snapshot);
    restoreCaret(snapshot);
  };

  // Global mod+z / mod+shift+z / mod+y. The ShortcutLayer only knows app-level
  // shortcuts, so undo/redo live here on the editor's document listener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      // Never hijack native undo/redo inside inputs outside the editor
      // (e.g. page title). Inside the editor our re-renders break the native
      // history, so we take over there.
      const ae = document.activeElement;
      if ((ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) && !rootRef.current?.contains(ae)) {
        return;
      }
      const redo = k === "y" || e.shiftKey;
      e.preventDefault();
      if (redo) redoHistory();
      else undoHistory();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag cleanup on dragend (fires even when dropped outside a target).
  useEffect(() => {
    const onEnd = () => {
      setDraggingId(null); setDragOver(null);
      draggingIdRef.current = null; dragOverRef.current = null;
    };
    window.addEventListener("dragend", onEnd);
    return () => window.removeEventListener("dragend", onEnd);
  }, []);

  const requestFocus = (id: string, at: "start" | "end", mode?: "highlight" | "link") => {
    setFocusedBlockId(id);
    setCaretTarget({ id, at, seq: ++seqRef.current, mode });
  };

  const closeSlash = () => { setSlashQuery(null); setSlashActive(0); };

  // ---- slash -------------------------------------------------------------
  const insertAfter = (idx: number, nb: Block) => {
    commit((prev) => {
      const next = [...prev.slice(0, idx + 1), nb, ...prev.slice(idx + 1)];
      return next.map((b, i) => ({ ...b, order: i, updatedAt: b.id === nb.id ? Date.now() : b.updatedAt }));
    });
    requestFocus(nb.id, "end");
  };

  // Command palette: insert a block (content "/" so the slash menu opens on
  // focus) right after the focused block, or at the end if none is focused.
  useEffect(() => {
    return onRequestBlockInsert((req) => {
      if (req.pageId !== pageId || req.mode !== "after-focused") return;
      const fid = focusedIdRef.current;
      const arr = blocksRef.current;
      const idx = fid ? arr.findIndex((b) => b.id === fid) : -1;
      const nb = newBlock(pageId, "paragraph", "/");
      if (idx >= 0) {
        insertAfter(idx, nb);
      } else {
        commit(() => [
          ...blocksRef.current.map((b, i) => ({ ...b, order: i })),
          { ...nb, order: blocksRef.current.length },
        ]);
        requestFocus(nb.id, "end");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  const slashSelect = (type: SlashCommand) => {
    const fid = focusedIdRef.current;
    if (!fid) { closeSlash(); return; }
    const idx = blocksRef.current.findIndex((b) => b.id === fid);
    if (idx === -1) { closeSlash(); return; }

    if (type === "image" || type === "file") {
      setPickKind(type);
      closeSlash();
      fileInputRef.current?.click();
      return;
    }

    if (type === "table") {
      const rows = [["", "", ""], ["", "", ""], ["", "", ""]];
      commit((prev) => prev.map((b) => (b.id === fid ? { ...b, type, content: "", rich: [], rows, indent: 0, updatedAt: Date.now() } : b)));
      closeSlash();
      requestFocus(fid, "end");
      return;
    }

    if (type === "divider") {
      const nb = newBlock(pageId, "paragraph", "");
      commit((prev) => {
        const divIdx = prev.findIndex((b) => b.id === fid);
        if (divIdx === -1) return prev;
        const converted = prev.map((b) => b.id === fid
          ? { ...b, type, content: "", rich: [], indent: 0, checked: false, rows: [], attachmentId: null, calloutType: undefined, language: undefined, updatedAt: Date.now() }
          : b);
        const next = [...converted.slice(0, divIdx + 1), nb, ...converted.slice(divIdx + 1)];
        return next.map((b, i) => ({ ...b, order: i, updatedAt: b.id === nb.id ? Date.now() : b.updatedAt }));
      });
      closeSlash();
      requestFocus(nb.id, "start");
      return;
    }

    // ---- slash actions that act on the current block ----------------------
    if (type === "date" || type === "time") {
      const d = new Date();
      const text = type === "date"
        ? isoDate()
        : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      commit((prev) => prev.map((b) => (b.id === fid ? { ...b, content: text, rich: [], updatedAt: Date.now() } : b)));
      closeSlash();
      requestFocus(fid, "end");
      return;
    }
    if (type === "page-link") {
      commit((prev) => prev.map((b) => (b.id === fid ? { ...b, content: "[[", rich: [], updatedAt: Date.now() } : b)));
      closeSlash();
      requestFocus(fid, "end");
      return;
    }
    if (type === "highlight") {
      commit((prev) => prev.map((b) => (b.id === fid ? { ...b, content: "", rich: [], updatedAt: Date.now() } : b)));
      closeSlash();
      requestFocus(fid, "end", "highlight");
      return;
    }
    if (type === "link") {
      commit((prev) => prev.map((b) => (b.id === fid ? { ...b, content: "", rich: [], updatedAt: Date.now() } : b)));
      closeSlash();
      requestFocus(fid, "end", "link");
      return;
    }
    if (type === "clear-format") {
      // Remove the literal "/<query>" the user typed (it may be at the start,
      // middle or end depending on where the caret was), then clear spans.
      const cmdText = slashRef.current.query ? `/${slashRef.current.query}` : "";
      commit((prev) => prev.map((b) =>
        b.id === fid
          ? {
              ...b,
              content: cmdText && b.content.includes(cmdText) ? b.content.replace(cmdText, "") : b.content,
              rich: [],
              updatedAt: Date.now(),
            }
          : b,
      ));
      closeSlash();
      requestFocus(fid, "end");
      return;
    }
    if (type === "duplicate") {
      closeSlash();
      onDuplicate(fid);
      return;
    }
    if (type === "delete") {
      closeSlash();
      onDelete(fid);
      return;
    }

    // ---- block type conversions -------------------------------------------
    commit((prev) => prev.map((b) =>
      b.id === fid
        ? {
            ...b, type, content: "", rich: [], indent: 0, checked: false, rows: [], attachmentId: null,
            calloutType: type === "callout" ? "note" : undefined,
            language: type === "code" ? "" : undefined,
            collapsed: type === "toggle" ? false : undefined,
            updatedAt: Date.now(),
          }
        : b,
    ));
    closeSlash();
    requestFocus(fid, "end");
  };

  const handleFilesPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const fileList = Array.from(input.files ?? []);
    input.value = "";
    if (fileList.length === 0) return;

    const kind = pickKind;
    setPickKind(null);
    const type: "image" | "file" = kind ?? "file";
    const targetId = focusedIdRef.current;
    const added = await addFiles(fileList);
    if (added.length === 0 || !targetId) return;
    const fileRef = added[0];
    void attachFileToPage(fileRef.id, pageId);
    commit((prev) => prev.map((b) =>
      b.id === targetId
        ? { ...b, type, content: "", rich: [], attachmentId: fileRef.id, indent: 0, rows: [], checked: false, calloutType: undefined, language: undefined, updatedAt: Date.now() }
        : b,
    ));
    requestFocus(targetId, "end");
  };

  // ---- block operations --------------------------------------------------
  const onContentChange = (id: string, content: string, rich?: InlineSpan[]) => {
    const cur = blocksRef.current.find((b) => b.id === id);
    const md = cur && isTextType(cur.type) && cur.type !== "code"
      ? (matchMarkdown(content) ?? matchDeferredBullet(content))
      : null;

    commit((prev) => {
      const target = prev.find((b) => b.id === id);
      if (!target) return prev;
      if (md) {
        return prev.map((b) => (b.id === id
          ? { ...b, type: md.type, content: md.content, checked: md.checked ?? b.checked, rich: [], updatedAt: Date.now() }
          : b));
      }
      return prev.map((b) => (b.id === id ? { ...b, content, rich: rich ?? [], updatedAt: Date.now() } : b));
    });

    if (md) {
      requestFocus(id, "end");
      closeSlash();
    } else if (id === focusedIdRef.current) {
      if (content.startsWith("/")) { setSlashQuery(content.slice(1)); setSlashActive(0); }
      else if (slashRef.current.query !== null) closeSlash();
    }
  };

  const onTypeChange = (id: string, type: BlockType) => {
    commit((prev) => {
      const cur = prev.find((b) => b.id === id);
      if (!cur || cur.type === type) return prev;
      const isList = type === "bulletList" || type === "numberedList" || type === "todoList";
      return prev.map((b) => b.id === id
        ? {
            ...b, type,
            indent: isList ? b.indent : 0,
            checked: type === "todoList" ? b.checked : false,
            calloutType: type === "callout" ? (b.calloutType ?? "note") : undefined,
            language: type === "code" ? (b.language ?? "") : undefined,
            collapsed: type === "toggle" ? false : undefined,
            updatedAt: Date.now(),
          }
        : b);
    });
    requestFocus(id, "end");
  };

  const onBlurBlock = (id: string, content: string) => {
    const bare = matchBareMarker(content);
    if (!bare) return;
    commit((prev) => prev.map((b) => (b.id === id ? { ...b, type: bare.type, content: bare.content, rich: [], updatedAt: Date.now() } : b)));
  };

  const onPatch = (id: string, patch: Partial<Block>) => {
    commit((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b)));
  };

  const onFocusBlock = (id: string) => {
    setFocusedBlockId(id);
    const b = blocksRef.current.find((x) => x.id === id);
    if (b && b.content.startsWith("/")) { setSlashQuery(b.content.slice(1)); setSlashActive(0); }
    else if (slashRef.current.query !== null) closeSlash();
  };

  const onDelete = (id: string) => {
    const prev = blocksRef.current;
    const idx = prev.findIndex((b) => b.id === id);
    commit((cur) => cur.filter((b) => b.id !== id));
    const nextTarget = prev[idx + 1] ?? prev[idx - 1];
    if (nextTarget && isTextType(nextTarget.type)) requestFocus(nextTarget.id, "start");
    else setFocusedBlockId(null);
  };

  const onMove = (id: string, dir: "up" | "down") => {
    commit((cur) => {
      const idx = cur.findIndex((b) => b.id === id);
      const target = dir === "up" ? idx - 1 : idx + 1;
      if (idx === -1 || target < 0 || target >= cur.length) return cur;
      const next = [...cur];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((b, i) => ({ ...b, order: i, updatedAt: b.id === id ? Date.now() : b.updatedAt }));
    });
    requestFocus(id, "end");
  };

  const onCopyText = (id: string) => {
    const b = blocksRef.current.find((x) => x.id === id);
    if (!b || !b.content) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(b.content).then(
        () => pushNotice("success", "Text copied"),
        () => {},
      );
    }
  };

  const onDuplicate = (id: string) => {
    const src = blocksRef.current.find((b) => b.id === id);
    if (!src) return;
    const copy = newBlock(pageId, src.type, src.content);
    copy.checked = src.checked;
    copy.indent = src.indent;
    copy.rich = (src.rich ?? []).map((s) => ({ ...s }));
    copy.attachmentId = src.attachmentId;
    copy.rows = src.rows.map((r) => [...r]);
    copy.calloutType = src.calloutType;
    copy.language = src.language;
    const idx = blocksRef.current.findIndex((b) => b.id === id);
    insertAfter(idx, copy);
  };

  const onBackspaceAtStart = (blockId: string) => {
    const prev = blocksRef.current;
    const idx = prev.findIndex((b) => b.id === blockId);
    const cur = prev[idx];
    const before = idx > 0 ? prev[idx - 1] : null;
    if (!cur) return;

    if (cur.content !== "" && before && isTextType(before.type) && isTextType(cur.type)) {
      const merged = concatBlocks(before, cur);
      commit((arr) => arr.filter((b) => b.id !== blockId).map((b) => (b.id === before.id ? { ...before, ...merged, indent: before.indent, updatedAt: Date.now() } : b)));
      requestFocus(before.id, "end");
      return;
    }

    if (cur.content === "" && before) {
      commit((arr) => arr.filter((b) => b.id !== blockId));
      if (isTextType(before.type)) requestFocus(before.id, "end");
      else setFocusedBlockId(null);
      return;
    }

    // First block, empty, non-paragraph: collapse to a paragraph.
    if (cur.content === "" && !before && cur.type !== "paragraph") {
      onPatch(blockId, { type: "paragraph", indent: 0 });
    }
  };

  const onRequestFocus = (blockId: string, edge: "start" | "end", depth = 0) => {
    if (depth > 24) return;
    const arr = blocksRef.current;
    const idx = arr.findIndex((b) => b.id === blockId);
    const target = edge === "start" ? arr[idx - 1] : arr[idx + 1];
    if (!target) return;
    if (isTextType(target.type)) {
      requestFocus(target.id, edge === "start" ? "end" : "start");
    } else {
      onRequestFocus(target.id, edge, depth + 1);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent, block: Block) => {
    const arr = blocksRef.current;
    const idx = arr.findIndex((b) => b.id === block.id);
    const isList = block.type === "bulletList" || block.type === "numberedList" || block.type === "todoList";
    const slash = slashRef.current;
    const items = slash.query !== null ? filterSlashItems(slash.query) : [];

    if (slash.query !== null && block.id === focusedIdRef.current) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSlashActive((i) => (e.key === "ArrowDown" ? Math.min(i + 1, Math.max(0, items.length - 1)) : Math.max(0, i - 1)));
        return;
      }
      if (e.key === "Enter") {
        const item = items[slash.active];
        if (item) {
          e.preventDefault();
          slashSelect(item.type);
          return;
        }
        // No item matched the query. Keep "/query" as literal text and fall
        // through to the normal Enter handling (new block) instead of
        // swallowing the key — the menu hint says "Type Enter to keep it as text".
        closeSlash();
      }
      if (e.key === "Escape") { e.preventDefault(); closeSlash(); return; }
      if (e.key === "Tab") { e.preventDefault(); return; }
      // fall through for regular typing
    }

    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
      if (e.key === "Home") {
        e.preventDefault();
        const first = arr.find((b) => isTextType(b.type));
        if (first) requestFocus(first.id, "start");
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        let last: Block | undefined;
        for (let i = arr.length - 1; i >= 0; i -= 1) {
          if (isTextType(arr[i].type)) { last = arr[i]; break; }
        }
        if (last) requestFocus(last.id, "end");
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && block.type !== "code" && block.type !== "math") {
      e.preventDefault();
      if (block.content === "- ") {
        onPatch(block.id, { type: "bulletList", content: "", indent: 0 });
        insertAfter(idx, newBlock(pageId, "bulletList", ""));
        return;
      }
      if (block.type === "divider") {
        insertAfter(idx, newBlock(pageId, "paragraph", ""));
        return;
      }
      if (isList) {
        if (block.content === "") {
          onPatch(block.id, { type: "paragraph", indent: 0 });
          return;
        }
        const nb = newBlock(pageId, block.type, "");
        nb.indent = block.indent;
        insertAfter(idx, nb);
        return;
      }
      insertAfter(idx, newBlock(pageId, "paragraph", ""));
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const indentable = isList || block.type === "paragraph" || block.type === "quote";
      if (indentable) {
        const next = Math.max(0, Math.min(6, block.indent + (e.shiftKey ? -1 : 1)));
        onPatch(block.id, { indent: next });
      }
      return;
    }

    if (e.key === "Escape") {
      (e.target as HTMLElement).blur?.();
      setFocusedBlockId(null);
      closeSlash();
      return;
    }
  };

  const onOpenLink = (title: string) => {
    const target = pagesRef.current.find((p) => p.title.toLowerCase() === title.toLowerCase());
    if (target) {
      navigate({ name: "page", id: target.id });
      return;
    }
    void createPage(null, title).then((p) => {
      navigate({ name: "page", id: p.id });
      pushNotice("success", "Page created");
    });
  };

  // ---- drag & drop -------------------------------------------------------
  const onDragStart = (_e: React.DragEvent, id: string) => {
    draggingIdRef.current = id;
    setDraggingId(id);
  };

  const onDragOverBlock = (e: React.DragEvent, id: string) => {
    if (id === draggingIdRef.current) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const pos: "before" | "after" = e.clientY - rect.top < rect.height / 2 ? "before" : "after";
    const next = { id, pos };
    dragOverRef.current = next;
    setDragOver((d) => (d && d.id === id && d.pos === pos ? d : next));
  };

  const onDropBlock = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    const fromId = draggingIdRef.current;
    const pos = dragOverRef.current?.id === id ? dragOverRef.current.pos : "after";
    draggingIdRef.current = null;
    dragOverRef.current = null;
    setDraggingId(null);
    setDragOver(null);
    if (!fromId || fromId === id) return;
    commit((cur) => {
      const fromIdx = cur.findIndex((b) => b.id === fromId);
      const overIdx = cur.findIndex((b) => b.id === id);
      if (fromIdx === -1 || overIdx === -1) return cur;
      let insertIdx = overIdx + (pos === "after" ? 1 : 0);
      if (fromIdx < insertIdx) insertIdx -= 1;
      const next = [...cur];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(insertIdx, 0, moved);
      return next.map((b, i) => ({ ...b, order: i, updatedAt: b.id === fromId ? Date.now() : b.updatedAt }));
    });
    requestFocus(fromId, "end");
  };

  // ---- derived -----------------------------------------------------------
  const numbers = useMemo(() => {
    const map = new Map<string, number>();
    let count = 0;
    let lastIndent: number | null = null;
    for (const b of blocks) {
      if (b.type === "numberedList") {
        count = lastIndent !== null && b.indent === lastIndent ? count + 1 : 1;
        lastIndent = b.indent;
        map.set(b.id, count);
      } else {
        count = 0;
        lastIndent = null;
      }
    }
    return map;
  }, [blocks]);

  const fileById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);

  // All volatile values are read through refs, so the handlers object is
  // created once and can be passed to memoized blocks by reference.
  const handlers: EditorHandlers = useMemo(() => ({
    onContentChange, onPatch, onKeyDown, onFocusBlock, onBlurBlock, onTypeChange, onDelete, onDuplicate,
    onMove, onCopyText, onDragStart, onDropBlock, onDragOverBlock, onRequestFocus, onBackspaceAtStart, onOpenLink,
    getBlobUrl: async (file) => {
      const blob = await getFileBlob(file);
      return blob ? URL.createObjectURL(blob) : null;
    },
    slashSelect,
    slashSetActive: setSlashActive,
    slashClose: closeSlash,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  return (
    <div className="editor-scroll" ref={rootRef}>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={pickKind === "image" ? "image/*" : undefined}
        onChange={handleFilesPicked}
      />
      <div className="space-y-[2px]">
        {blocks.map((block, i) => {
          const focused = focusedBlockId === block.id;
          return (
            <EditorBlock
              key={block.id}
              block={block}
              number={numbers.get(block.id) ?? null}
              file={block.attachmentId ? fileById.get(block.attachmentId) : undefined}
              focused={focused}
              slash={slashQuery !== null && focused ? { query: slashQuery, active: slashActive } : null}
              caretTarget={caretTarget?.id === block.id ? caretTarget : null}
              dragOverPos={dragOver?.id === block.id ? dragOver.pos : null}
              firstBlock={i === 0}
              lastBlock={i === blocks.length - 1}
              handlers={handlers}
            />
          );
        })}
        <button
          type="button"
          onClick={() => {
            const nb = newBlock(pageId, "paragraph", "");
            commit(() => [...blocksRef.current.map((b, i) => ({ ...b, order: i })), { ...nb, order: blocksRef.current.length }]);
            requestFocus(nb.id, "end");
          }}
          className="group w-full flex items-center gap-2 mt-1 mb-10 py-2 pl-[2px] text-left text-[13.5px] text-ink-3 hover:text-ink transition-colors"
        >
          <span className="w-5 h-5 flex items-center justify-center rounded-[5px] border border-line group-hover:border-accent group-hover:text-accent text-ink-3">+</span>
          Add a block
        </button>
      </div>
    </div>
  );
}
