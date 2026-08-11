"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Block, BlockType, InlineSpan } from "@/lib/core/types";
import { newBlock } from "@/lib/core/types";
import { useApp } from "@/lib/store/app";
import { navigate } from "@/lib/store/router";
import { EditorBlock, type EditorHandlers } from "./block";
import { filterSlashItems } from "./slash-menu";
import {
  concatBlocks, matchBareMarker, matchDeferredBullet, matchMarkdown,
} from "@/lib/core/rich";

const TEXT_TYPES = new Set<BlockType>([
  "paragraph", "heading1", "heading2", "heading3",
  "bulletList", "numberedList", "todoList", "quote", "code",
]);

function isTextType(t: BlockType): boolean {
  return TEXT_TYPES.has(t);
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
  const [caretTarget, setCaretTarget] = useState<{ id: string; at: "start" | "end"; seq: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const seqRef = useRef(0);
  const commitTimer = useRef<number | null>(null);
  const latestBlocks = useRef<Block[]>(blocks);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickKind, setPickKind] = useState<"image" | "file" | null>(null);

  // ---- persistence -------------------------------------------------------
  const applyBlocks = (next: Block[]) => {
    setBlocks(next);
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

  // Drag cleanup on dragend (fires even when dropped outside a target).
  useEffect(() => {
    const onEnd = () => { setDraggingId(null); setDragOverId(null); };
    window.addEventListener("dragend", onEnd);
    return () => window.removeEventListener("dragend", onEnd);
  }, []);

  const requestFocus = (id: string, at: "start" | "end") => {
    setFocusedBlockId(id);
    setCaretTarget({ id, at, seq: ++seqRef.current });
  };

  // ---- slash -------------------------------------------------------------
  const slashItems = useMemo(
    () => (slashQuery !== null ? filterSlashItems(slashQuery) : []),
    [slashQuery],
  );

  const closeSlash = () => { setSlashQuery(null); setSlashActive(0); };

  const slashSelect = (type: BlockType) => {
    const fid = focusedBlockId;
    if (!fid) { closeSlash(); return; }
    const idx = blocks.findIndex((b) => b.id === fid);
    if (idx === -1) { closeSlash(); return; }

    if (type === "image" || type === "file") {
      setPickKind(type);
      closeSlash();
      fileInputRef.current?.click();
      return;
    }

    if (type === "table") {
      const rows = [["", "", ""], ["", "", ""], ["", "", ""]];
      applyBlocks(blocks.map((b) => (b.id === fid ? { ...b, type, content: "", rich: [], rows, indent: 0, updatedAt: Date.now() } : b)));
      closeSlash();
      requestFocus(fid, "end");
      return;
    }

    const converted = blocks.map((b) =>
      b.id === fid
        ? { ...b, type, content: "", rich: [], indent: 0, checked: false, rows: [], attachmentId: null, updatedAt: Date.now() }
        : b,
    );

    if (type === "divider") {
      const after = [...converted.slice(0, idx + 1), newBlock(pageId, "paragraph", ""), ...converted.slice(idx + 1)];
      const ordered = after.map((b, i) => ({ ...b, order: i, updatedAt: b.id === after[idx + 1].id ? Date.now() : b.updatedAt }));
      applyBlocks(ordered);
      closeSlash();
      requestFocus(after[idx + 1].id, "start");
      return;
    }

    applyBlocks(converted);
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
    const targetId = focusedBlockId;
    const added = await addFiles(fileList);
    if (added.length === 0 || !targetId) return;
    const fileRef = added[0];
    void attachFileToPage(fileRef.id, pageId);
    const idx = blocks.findIndex((b) => b.id === targetId);
    if (idx === -1) return;
    applyBlocks(blocks.map((b) =>
      b.id === targetId ? { ...b, type, content: "", rich: [], attachmentId: fileRef.id, indent: 0, rows: [], checked: false, updatedAt: Date.now() } : b,
    ));
    requestFocus(targetId, "end");
  };

  // ---- block operations --------------------------------------------------
  const onContentChange = (id: string, content: string, rich?: InlineSpan[]) => {
    const target = blocks.find((b) => b.id === id);

    // Markdown-style shortcuts (paragraph/heading-like text blocks only).
    const md = matchMarkdown(content) ?? matchDeferredBullet(content);
    if (md && target && isTextType(target.type) && target.type !== "code") {
      applyBlocks(blocks.map((b) => (b.id === id
        ? { ...b, type: md.type, content: md.content, checked: md.checked ?? b.checked, rich: [], updatedAt: Date.now() }
        : b)));
      if (id === focusedBlockId && slashQuery !== null) closeSlash();
      requestFocus(id, "end");
      return;
    }

    applyBlocks(blocks.map((b) => (b.id === id ? { ...b, content, rich: rich ?? [], updatedAt: Date.now() } : b)));
    if (id === focusedBlockId) {
      if (content.startsWith("/")) { setSlashQuery(content.slice(1)); setSlashActive(0); }
      else if (slashQuery !== null) closeSlash();
    }
  };

  const onTypeChange = (id: string, type: BlockType) => {
    const idx = blocks.findIndex((b) => b.id === id);
    const cur = blocks[idx];
    if (!cur || cur.type === type) return;
    const isList = type === "bulletList" || type === "numberedList" || type === "todoList";
    applyBlocks(blocks.map((b) =>
      b.id === id
        ? { ...b, type, indent: isList ? b.indent : 0, checked: type === "todoList" ? b.checked : false, updatedAt: Date.now() }
        : b));
    requestFocus(id, "end");
  };

  const onBlurBlock = (id: string, content: string) => {
    const bare = matchBareMarker(content);
    if (!bare) return;
    applyBlocks(blocks.map((b) => (b.id === id ? { ...b, type: bare.type, content: bare.content, rich: [], updatedAt: Date.now() } : b)));
  };

  const onPatch = (id: string, patch: Partial<Block>) => {
    applyBlocks(blocks.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b)));
  };

  const onFocusBlock = (id: string) => {
    setFocusedBlockId(id);
    const b = blocks.find((x) => x.id === id);
    if (b && b.content.startsWith("/")) { setSlashQuery(b.content.slice(1)); setSlashActive(0); }
    else if (slashQuery !== null) closeSlash();
  };

  const onDelete = (id: string) => {
    const idx = blocks.findIndex((b) => b.id === id);
    applyBlocks(blocks.filter((b) => b.id !== id));
    const nextTarget = blocks[idx + 1] ?? blocks[idx - 1];
    if (nextTarget && isTextType(nextTarget.type)) requestFocus(nextTarget.id, "start");
    else setFocusedBlockId(null);
  };

  const onDuplicate = (id: string) => {
    const idx = blocks.findIndex((b) => b.id === id);
    const src = blocks[idx];
    if (!src) return;
    const copy = newBlock(pageId, src.type, src.content);
    copy.checked = src.checked;
    copy.indent = src.indent;
    copy.rich = (src.rich ?? []).map((s) => ({ ...s }));
    copy.attachmentId = src.attachmentId;
    copy.rows = src.rows.map((r) => [...r]);
    insertAfter(idx, copy);
  };

  const insertAfter = (idx: number, nb: Block) => {
    const next = [...blocks.slice(0, idx + 1), nb, ...blocks.slice(idx + 1)];
    const ordered = next.map((b, i) => ({ ...b, order: i, updatedAt: b.id === nb.id ? Date.now() : b.updatedAt }));
    applyBlocks(ordered);
    requestFocus(nb.id, "end");
  };

  const onBackspaceAtStart = (blockId: string) => {
    const idx = blocks.findIndex((b) => b.id === blockId);
    const cur = blocks[idx];
    const prev = idx > 0 ? blocks[idx - 1] : null;
    if (!cur) return;

    if (cur.content !== "" && prev && isTextType(prev.type) && isTextType(cur.type)) {
      const merged = concatBlocks(prev, cur);
      applyBlocks(blocks.filter((b) => b.id !== blockId).map((b) => (b.id === prev.id ? { ...prev, ...merged, indent: prev.indent, updatedAt: Date.now() } : b)));
      requestFocus(prev.id, "end");
      return;
    }

    if (cur.content === "" && prev) {
      applyBlocks(blocks.filter((b) => b.id !== blockId));
      if (isTextType(prev.type)) requestFocus(prev.id, "end");
      else setFocusedBlockId(null);
      return;
    }

    // First block, empty, non-paragraph: collapse to a paragraph.
    if (cur.content === "" && !prev && cur.type !== "paragraph") {
      onPatch(blockId, { type: "paragraph", indent: 0 });
    }
  };

  const onRequestFocus = (blockId: string, edge: "start" | "end", depth = 0) => {
    if (depth > 24) return;
    const idx = blocks.findIndex((b) => b.id === blockId);
    const target = edge === "start" ? blocks[idx - 1] : blocks[idx + 1];
    if (!target) return;
    if (isTextType(target.type)) {
      requestFocus(target.id, edge === "start" ? "end" : "start");
    } else {
      onRequestFocus(target.id, edge, depth + 1);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent, block: Block) => {
    const idx = blocks.findIndex((b) => b.id === block.id);
    const isList = block.type === "bulletList" || block.type === "numberedList" || block.type === "todoList";

    if (slashQuery !== null && block.id === focusedBlockId) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSlashActive((i) => (e.key === "ArrowDown" ? Math.min(i + 1, slashItems.length - 1) : Math.max(0, i - 1)));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = slashItems[slashActive];
        if (item) slashSelect(item.type);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); closeSlash(); return; }
      if (e.key === "Tab") { e.preventDefault(); return; }
      // fall through for regular typing
    }

    if (e.key === "Enter" && !e.shiftKey && block.type !== "code") {
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
    const target = pages.find((p) => p.title.toLowerCase() === title.toLowerCase());
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
    setDraggingId(id);
  };

  const onDragOverBlock = (_e: React.DragEvent, id: string) => {
    if (id !== draggingId) setDragOverId(id);
  };

  const onDropBlock = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    const fromId = draggingId;
    const overId = id;
    setDraggingId(null);
    setDragOverId(null);
    if (!fromId || fromId === overId) return;
    const fromIdx = blocks.findIndex((b) => b.id === fromId);
    const overIdx = blocks.findIndex((b) => b.id === overId);
    if (fromIdx === -1 || overIdx === -1) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY - rect.top > rect.height / 2;
    let insertIdx = overIdx + (after ? 1 : 0);
    if (fromIdx < insertIdx) insertIdx -= 1;
    const next = [...blocks];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(insertIdx, 0, moved);
    applyBlocks(next.map((b, i) => ({ ...b, order: i, updatedAt: b.id === fromId ? Date.now() : b.updatedAt })));
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

  const handlers: EditorHandlers = {
    onContentChange, onPatch, onKeyDown, onFocusBlock, onBlurBlock, onTypeChange, onDelete, onDuplicate,
    onDragStart, onDropBlock, onDragOverBlock, onRequestFocus, onBackspaceAtStart, onOpenLink,
    getFile: (attachmentId) => (attachmentId ? fileById.get(attachmentId) : undefined),
    getBlobUrl: async (file) => {
      const blob = await getFileBlob(file);
      return blob ? URL.createObjectURL(blob) : null;
    },
    focusedBlockId,
    slashQuery,
    slashActive,
    slashSelect,
    slashSetActive: setSlashActive,
    slashClose: closeSlash,
    isDraggingOver: (id) => dragOverId === id,
    caretTarget,
  };

  return (
    <div className="editor-scroll">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={pickKind === "image" ? "image/*" : undefined}
        onChange={handleFilesPicked}
      />
      <div className="space-y-[2px]">
        {blocks.map((block) => (
          <EditorBlock
            key={block.id}
            block={block}
            number={numbers.get(block.id) ?? null}
            handlers={handlers}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            const nb = newBlock(pageId, "paragraph", "");
            applyBlocks([...blocks.map((b, i) => ({ ...b, order: i })), { ...nb, order: blocks.length }]);
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
