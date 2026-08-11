"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Block, BlockType, FileRef, HighlightColor, InlineSpan } from "@/lib/core/types";
import { formatBytes } from "@/lib/core/util";
import { readBlock, renderMath, richHtml } from "@/lib/core/rich";
import { IconCheck, IconCopy, IconDownload, IconFileOther, IconGrip, IconMath, IconTrash } from "@/components/icons";
import { Menu, MenuItem, MenuSeparator } from "@/components/primitives";
import { SlashMenu } from "./slash-menu";
import { FormatToolbar, type FormatActive, type FormatCommand } from "./format-toolbar";

export interface EditorHandlers {
  onContentChange: (blockId: string, content: string, rich?: InlineSpan[]) => void;
  onPatch: (blockId: string, patch: Partial<Block>) => void;
  onKeyDown: (e: React.KeyboardEvent, block: Block) => void;
  onFocusBlock: (blockId: string) => void;
  onBlurBlock: (blockId: string, content: string) => void;
  onTypeChange: (blockId: string, type: BlockType) => void;
  onDelete: (blockId: string) => void;
  onDuplicate: (blockId: string) => void;
  onDragStart: (e: React.DragEvent, blockId: string) => void;
  onDropBlock: (e: React.DragEvent, blockId: string) => void;
  onDragOverBlock: (e: React.DragEvent, blockId: string) => void;
  /** arrow at an edge: move focus to the neighbour block */
  onRequestFocus: (blockId: string, edge: "start" | "end") => void;
  /** caret at the very start of a text block: merge into / delete the previous block */
  onBackspaceAtStart: (blockId: string) => void;
  onOpenLink: (title: string) => void;
  getFile: (attachmentId: string | null) => FileRef | undefined;
  getBlobUrl: (file: FileRef) => Promise<string | null>;
  focusedBlockId: string | null;
  slashQuery: string | null;
  slashActive: number;
  slashSelect: (type: Block["type"]) => void;
  slashSetActive: (i: number) => void;
  slashClose: () => void;
  isDraggingOver: (id: string) => boolean;
  /** focus request dispatched by the editor (e.g. after creating a block) */
  caretTarget: { id: string; at: "start" | "end"; seq: number } | null;
}

function caretEdges(el: HTMLElement): { atStart: boolean; atEnd: boolean } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return { atStart: false, atEnd: false };
  const range = sel.getRangeAt(0);
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) {
    textNodes.push(n as Text);
    n = walker.nextNode();
  }
  if (textNodes.length === 0) return { atStart: true, atEnd: true };
  const first = textNodes[0];
  const last = textNodes[textNodes.length - 1];
  const atStart = range.startContainer === first && range.startOffset === 0;
  const atEnd =
    range.startContainer === last && range.startOffset === (last.textContent?.length ?? 0);
  return { atStart, atEnd };
}

function placeCaretEnd(el: HTMLElement): void {
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function unwrapChips(el: HTMLElement): void {
  const chips = el.querySelectorAll(".link-chip");
  chips.forEach((c) => {
    const parent = c.parentNode;
    if (parent) parent.replaceChild(document.createTextNode(c.textContent ?? ""), c);
  });
}

function selectionInsideTag(el: HTMLElement, tag: string): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const end = range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement;
  const climb = (node: Node | null): boolean => {
    let x: Node | null = node;
    while (x && x !== el) {
      if (x instanceof Element && x.tagName === tag.toUpperCase()) return true;
      x = x.parentElement;
    }
    return false;
  };
  return start !== null && end !== null && climb(start) && climb(end);
}

function selectionHighlightColor(el: HTMLElement): HighlightColor | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const m = startEl?.closest("mark")?.className.match(/hl-(yellow|green|pink|blue)/);
  return m ? (m[1] as HighlightColor) : null;
}

function useBlobUrl(
  file: FileRef | undefined,
  getBlobUrl: EditorHandlers["getBlobUrl"],
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    if (!file) { setUrl(null); return; }
    void getBlobUrl(file).then((u) => {
      if (!alive) { if (u) URL.revokeObjectURL(u); return; }
      if (u) objectUrl = u;
      setUrl(u);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, getBlobUrl]);
  return url;
}

export function EditorBlock({
  block,
  handlers,
  number = null,
}: {
  block: Block;
  handlers: EditorHandlers;
  number?: number | null;
}) {
  const {
    onContentChange, onPatch, onKeyDown, onFocusBlock, onBlurBlock, onTypeChange,
    onDropBlock, onDragOverBlock, onRequestFocus,
    onBackspaceAtStart, onOpenLink, getFile, getBlobUrl, focusedBlockId, slashQuery,
    slashActive, slashSelect, slashSetActive, isDraggingOver, caretTarget,
  } = handlers;

  const elRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isFocused = focusedBlockId === block.id;
  const [checked, setChecked] = useState(block.checked);
  const file = getFile(block.attachmentId);
  const blobUrl = useBlobUrl(file, getBlobUrl);

  // Contextual formatting toolbar state.
  const [selRect, setSelRect] = useState<{ x: number; y: number } | null>(null);
  const [fmtActive, setFmtActive] = useState<FormatActive>({
    bold: false, italic: false, underline: false, strike: false, code: false, highlight: null,
  });
  const [linkMode, setLinkMode] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  // Mirror of linkMode for the DOM listener (effect closure) below.
  const linkModeRef = useRef(false);
  linkModeRef.current = linkMode;
  // Selection captured when link mode opens; the input steals focus, so the
  // live selection is unavailable by the time Apply runs.
  const linkRangeRef = useRef<Range | null>(null);

  useEffect(() => { setChecked(block.checked); }, [block.checked]);
  useEffect(() => { /* reset internal state on block swap */ }, [block.id]);

  // ---- reading the DOM back into content + spans --------------------------
  const syncModel = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const { content, spans } = readBlock(el);
    onContentChange(block.id, content, spans);
  }, [block.id, onContentChange]);

  // ---- programmatic focus (new block, merging, transforms) ----------------
  useEffect(() => {
    if (!caretTarget || caretTarget.id !== block.id) return;
    const el = (elRef.current ?? taRef.current) as HTMLElement | null;
    if (!el) return;
    const t = window.setTimeout(() => {
      if (!(el instanceof HTMLTextAreaElement)) {
        el.innerHTML = richHtml(block.content, block.rich, false);
      }
      el.focus();
      if (el instanceof HTMLTextAreaElement) {
        const pos = caretTarget.at === "start" ? 0 : el.value.length;
        el.setSelectionRange(pos, pos);
        return;
      }
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(caretTarget.at === "start");
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, 0);
    return () => window.clearTimeout(t);
  }, [caretTarget, block.id, block.content, block.rich]);

  // ---- render: rich HTML (with chips) while blurred, untouched while focused
  useEffect(() => {
    if (isFocused) return;
    const el = elRef.current;
    if (!el) return;
    const html = richHtml(block.content, block.rich, true);
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [block.content, block.rich, block.id, isFocused]);

  // ---- contextual toolbar: follow a non-collapsed selection inside the block
  useEffect(() => {
    const update = () => {
      // While the link input is open the selection lives in the input, not the
      // block; don't let that collapse the toolbar away.
      if (linkModeRef.current) return;
      const el = elRef.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelRect(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const container =
        range.commonAncestorContainer instanceof Element
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
      if (!container || !el.contains(container)) {
        setSelRect(null);
        return;
      }
      const r = range.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) {
        setSelRect(null);
        return;
      }
      setSelRect({ x: r.left + r.width / 2, y: r.top });
      setFmtActive({
        bold: document.queryCommandState?.("bold") ?? false,
        italic: document.queryCommandState?.("italic") ?? false,
        underline: document.queryCommandState?.("underline") ?? false,
        strike: document.queryCommandState?.("strikeThrough") ?? false,
        code: selectionInsideTag(el, "code"),
        highlight: selectionHighlightColor(el),
      });
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("mouseup", update);
    window.addEventListener("keyup", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("mouseup", update);
      window.removeEventListener("keyup", update);
    };
  }, []);

  const handleFocus = () => {
    onFocusBlock(block.id);
    setLinkMode(false);
    linkRangeRef.current = null;
    const el = elRef.current;
    if (!el) return;
    // Editing view: unwrap link chips so [[Page]] is plain editable text.
    unwrapChips(el);
    if (el.innerText !== block.content) {
      el.innerHTML = richHtml(block.content, block.rich, false);
      placeCaretEnd(el);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // Focus is moving into the floating toolbar (e.g. the link input) — keep
    // the toolbar open instead of dismissing it.
    const related = e.relatedTarget as HTMLElement | null;
    if (related?.closest(".format-toolbar")) return;
    setSelRect(null);
    setLinkMode(false);
    onBlurBlock(block.id, block.content);
  };

  const handleInput = () => syncModel();

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const link = target.dataset.link;
    if (!link) return;
    e.preventDefault();
    if (target.dataset.external === "true" && /^https?:\/\//i.test(link)) {
      window.open(link, "_blank", "noopener,noreferrer");
      return;
    }
    onOpenLink(link);
  };

  // ---- formatting ---------------------------------------------------------
  const applyInlineCode = (el: HTMLElement) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (selectionInsideTag(el, "code")) {
      const startEl = range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
      const codeEl = startEl?.closest("code");
      if (codeEl) {
        const parent = codeEl.parentNode;
        if (parent) {
          while (codeEl.firstChild) parent.insertBefore(codeEl.firstChild, codeEl);
          parent.removeChild(codeEl);
        }
      }
      return;
    }
    if (!range.collapsed) {
      const code = document.createElement("code");
      code.className = "editor-inline-code";
      code.textContent = range.toString();
      range.deleteContents();
      range.insertNode(code);
      const sel2 = window.getSelection();
      const r2 = document.createRange();
      r2.setStartAfter(code);
      r2.collapse(true);
      sel2?.removeAllRanges();
      sel2?.addRange(r2);
      return;
    }
    // Collapsed caret: open an empty code run so typing is styled as code.
    const code = document.createElement("code");
    code.className = "editor-inline-code";
    code.textContent = "\u200b";
    range.insertNode(code);
    const sel2 = window.getSelection();
    const r2 = document.createRange();
    r2.selectNodeContents(code);
    r2.collapse(true);
    sel2?.removeAllRanges();
    sel2?.addRange(r2);
  };

  const openLinkInput = () => {
    const el = elRef.current;
    let existing = "";
    const sel = window.getSelection();
    if (el && sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (!range.collapsed) linkRangeRef.current = range.cloneRange();
      const container = range.startContainer;
      const startEl = container instanceof Element ? container : container.parentElement;
      const a = startEl?.closest("a.inline-link");
      if (a) existing = a.getAttribute("data-link") ?? "";
    }
    setLinkValue(existing);
    setLinkMode(true);
  };

  const applyHighlight = (el: HTMLElement, color: HighlightColor | null) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const startEl = range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
    const markEl = startEl?.closest("mark");
    if (!color) {
      // Clear: unwrap any mark the caret/selection sits in.
      if (markEl) {
        const parent = markEl.parentNode;
        if (parent) {
          while (markEl.firstChild) parent.insertBefore(markEl.firstChild, markEl);
          parent.removeChild(markEl);
        }
      }
      return;
    }
    if (markEl) {
      markEl.className = `hl-${color}`;
      return;
    }
    if (!range.collapsed) {
      const mark = document.createElement("mark");
      mark.className = `hl-${color}`;
      mark.textContent = range.toString();
      range.deleteContents();
      range.insertNode(mark);
      const sel2 = window.getSelection();
      const r2 = document.createRange();
      r2.setStartAfter(mark);
      r2.collapse(true);
      sel2?.removeAllRanges();
      sel2?.addRange(r2);
      return;
    }
    // Collapsed caret: open an empty highlight run so typing stays highlighted.
    const mark = document.createElement("mark");
    mark.className = `hl-${color}`;
    mark.textContent = "\u200b";
    range.insertNode(mark);
    const sel2 = window.getSelection();
    const r2 = document.createRange();
    r2.selectNodeContents(mark);
    r2.collapse(true);
    sel2?.removeAllRanges();
    sel2?.addRange(r2);
  };

  const runFormat = (cmd: FormatCommand) => {
    const el = elRef.current;
    if (!el) return;
    el.focus();
    if (cmd === "code") {
      applyInlineCode(el);
    } else if (cmd === "link") {
      openLinkInput();
      return;
    } else if (cmd.startsWith("highlight:")) {
      const color = cmd === "highlight:none" ? null : (cmd.slice("highlight:".length) as HighlightColor);
      applyHighlight(el, color);
    } else {
      document.execCommand(cmd, false);
    }
    window.requestAnimationFrame(() => syncModel());
  };

  const applyLink = () => {
    const target = linkValue.trim();
    const el = elRef.current;
    if (!el) return;
    const range = linkRangeRef.current;
    if (range && !range.collapsed) {
      const startEl = range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
      const existing = startEl?.closest("a.inline-link");
      if (existing) {
        const parent = existing.parentNode;
        if (parent) parent.replaceChild(document.createTextNode(existing.textContent ?? ""), existing);
      }
      if (target) {
        const a = document.createElement("a");
        a.className = "inline-link";
        a.setAttribute("data-link", target);
        a.textContent = range.toString();
        range.deleteContents();
        range.insertNode(a);
        const sel2 = window.getSelection();
        const r2 = document.createRange();
        r2.setStartAfter(a);
        r2.collapse(true);
        sel2?.removeAllRanges();
        sel2?.addRange(r2);
      }
    }
    linkRangeRef.current = null;
    setLinkMode(false);
    syncModel();
  };

  const onKeyDownLocal = (e: React.KeyboardEvent) => {
    const el = elRef.current;
    const mod = e.metaKey || e.ctrlKey;

    // Formatting shortcuts.
    if (mod && !e.altKey && !e.shiftKey && el) {
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); runFormat("bold"); return; }
      if (k === "i") { e.preventDefault(); runFormat("italic"); return; }
      if (k === "u") { e.preventDefault(); runFormat("underline"); return; }
      if (k === "e") { e.preventDefault(); runFormat("code"); return; }
    }
    if (mod && e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "x") { e.preventDefault(); runFormat("strikeThrough"); return; }
      if (k === "k") { e.preventDefault(); runFormat("link"); return; }
      if (e.key === "7") { e.preventDefault(); onTypeChange(block.id, "numberedList"); return; }
      if (e.key === "8") { e.preventDefault(); onTypeChange(block.id, "bulletList"); return; }
      if (e.key === "9") { e.preventDefault(); onTypeChange(block.id, "quote"); return; }
    }
    if (mod && e.altKey && !e.shiftKey) {
      const k = e.key;
      if (k === "0") { e.preventDefault(); onTypeChange(block.id, "paragraph"); return; }
      if (k === "1") { e.preventDefault(); onTypeChange(block.id, "heading1"); return; }
      if (k === "2") { e.preventDefault(); onTypeChange(block.id, "heading2"); return; }
      if (k === "3") { e.preventDefault(); onTypeChange(block.id, "heading3"); return; }
    }

    if (el && e.key === "Backspace" && caretEdges(el).atStart) {
      e.preventDefault();
      onBackspaceAtStart(block.id);
      return;
    }
    if (el && e.key === "ArrowUp" && caretEdges(el).atStart) {
      e.preventDefault();
      onRequestFocus(block.id, "start");
      return;
    }
    if (el && e.key === "ArrowDown" && caretEdges(el).atEnd) {
      e.preventDefault();
      onRequestFocus(block.id, "end");
      return;
    }
    onKeyDown(e, block);
  };

  const onTextareaKeyDown = (e: React.KeyboardEvent) => {
    const ta = taRef.current;
    if (ta && e.key === "ArrowUp" && ta.selectionStart === 0) {
      e.preventDefault();
      onRequestFocus(block.id, "start");
      return;
    }
    if (ta && e.key === "ArrowDown" && ta.selectionEnd === ta.value.length) {
      e.preventDefault();
      onRequestFocus(block.id, "end");
      return;
    }
    onKeyDown(e, block);
  };

  const wrapperStyle = { marginLeft: block.indent * 22 };
  const dragOver = (e: React.DragEvent) => {
    e.preventDefault();
    onDragOverBlock(e, block.id);
  };
  const isOver = isDraggingOver(block.id);

  const listMarker = () => {
    if (block.type === "bulletList") {
      return <span className="list-bullet w-4 shrink-0">{block.indent % 2 === 0 ? "•" : "◦"}</span>;
    }
    if (block.type === "numberedList") {
      return <span className="list-bullet w-5 shrink-0 text-right">{number ?? 1}.</span>;
    }
    if (block.type === "todoList") {
      return (
        <button
          type="button"
          aria-label={checked ? "Mark not done" : "Mark done"}
          onClick={() => {
            const next = !checked;
            setChecked(next);
            onPatch(block.id, { checked: next });
          }}
          className={`mt-[4px] w-[16px] h-[16px] shrink-0 rounded-[4px] border flex items-center justify-center transition-colors ${
            checked ? "bg-accent border-accent text-accent-ink" : "border-line-strong hover:border-accent"
          }`}
        >
          {checked && <IconCheck size={11} />}
        </button>
      );
    }
    return null;
  };

  // Non-text block types ----------------------------------------------------
  if (block.type === "divider") {
    return (
      <div className="editor-block-row group relative" style={wrapperStyle}>
        <Handle block={block} handlers={handlers} />
        <div className={`w-full py-2 rounded-[6px] ${isOver ? "bg-accent-soft" : ""}`}
          onDragOver={dragOver} onDrop={(e) => onDropBlock(e, block.id)}>
          <div className="h-px bg-line-strong" />
        </div>
      </div>
    );
  }

  if (block.type === "image" || block.type === "file") {
    const isImage = block.type === "image";
    return (
      <div className="editor-block-row group relative" style={wrapperStyle}>
        <Handle block={block} handlers={handlers} />
        <div
          className={`my-2 ${isImage ? "max-w-[540px]" : "max-w-[400px]"} ${isOver ? "opacity-60" : ""}`}
          onDragOver={dragOver}
          onDrop={(e) => onDropBlock(e, block.id)}
        >
          {isImage ? (
            blobUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={blobUrl} alt={file?.name ?? "Image"} className="w-full rounded-[8px] border border-line" draggable={false} />
            ) : (
              <div className="w-full h-40 rounded-[8px] border border-dashed border-line-strong flex items-center justify-center text-[12.5px] text-ink-3">
                Loading image…
              </div>
            )
          ) : (
            <div className="flex items-center gap-3 rounded-[8px] border border-line bg-surface-2 px-3.5 py-3">
              <span className="w-9 h-9 flex items-center justify-center rounded-[8px] bg-surface border border-line text-ink-3">
                <IconFileOther size={17} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{file?.name ?? "File"}</div>
                <div className="font-mono text-[10.5px] text-ink-3">
                  {file ? formatBytes(file.size) : "attached file"}
                </div>
              </div>
              {file && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Download"
                  title="Download"
                  onClick={() => {
                    void getBlobUrl(file).then((u) => {
                      if (u) {
                        const a = document.createElement("a");
                        a.href = u;
                        a.download = file.name;
                        a.click();
                        window.setTimeout(() => URL.revokeObjectURL(u), 4000);
                      }
                    });
                  }}
                >
                  <IconDownload size={15} />
                </button>
              )}
            </div>
          )}
          {!file && (
            <p className="mt-1 text-[11.5px] text-ink-3">
              {block.attachmentId ? "This file is no longer available." : "Attach a file from the handle menu."}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (block.type === "table") {
    const rows = block.rows.length > 0 ? block.rows : [["", "", ""]];
    return (
      <div className="editor-block-row group relative" style={wrapperStyle}>
        <Handle block={block} handlers={handlers} />
        <div className="my-2 w-full overflow-x-auto rounded-[6px] border border-line" onDragOver={dragOver} onDrop={(e) => onDropBlock(e, block.id)}>
          <table className="w-full border-collapse">
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-line last:border-b-0">
                  {row.map((cell, ci) => (
                    <td key={ci} className="border-r border-line last:border-r-0">
                      <input
                        value={cell}
                        aria-label={`Row ${ri + 1} column ${ci + 1}`}
                        className="w-full bg-transparent px-2.5 py-1.5 text-[13.5px] outline-none focus:bg-accent-soft/60"
                        onChange={(e) => {
                          const next = rows.map((r, i) => (i === ri ? [...r] : [...r]));
                          next[ri][ci] = e.target.value;
                          onPatch(block.id, { rows: next });
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (block.type === "code") {
    return (
      <div className="editor-block-row group relative" style={wrapperStyle}>
        <Handle block={block} handlers={handlers} />
        <textarea
          ref={taRef}
          value={block.content}
          rows={Math.max(2, block.content.split("\n").length)}
          spellCheck={false}
          placeholder="Type or paste code…"
          aria-label="Code block"
          className="editor-block editor-code !h-auto resize-y w-full"
          onFocus={() => onFocusBlock(block.id)}
          onInput={() => onFocusBlock(block.id)}
          onChange={(e) => onContentChange(block.id, e.target.value)}
          onKeyDown={onTextareaKeyDown}
        />
      </div>
    );
  }

  if (block.type === "math") {
    const previewHtml = renderMath(block.content, true);
    return (
      <div className="editor-block-row group relative" style={wrapperStyle}>
        <Handle block={block} handlers={handlers} />
        <div className={`flex-1 min-w-0 my-2 rounded-[8px] border ${isOver ? "border-accent" : "border-line"} bg-surface overflow-x-auto`}
          onDragOver={dragOver} onDrop={(e) => onDropBlock(e, block.id)}>
          {previewHtml ? (
            <div
              className="math-block px-4 py-3"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
              aria-label="Equation preview"
            />
          ) : (
            <div className="px-4 pt-2.5 text-[12.5px] text-ink-3 eyebrow">LaTeX preview</div>
          )}
          <textarea
            ref={taRef}
            value={block.content}
            rows={Math.max(1, block.content.split("\n").length)}
            spellCheck={false}
            placeholder="Type LaTeX, e.g. E = mc^2"
            aria-label="Math block"
            className="editor-block editor-code !h-auto w-full resize-y border-0 border-t border-line !rounded-none"
            onFocus={() => onFocusBlock(block.id)}
            onInput={() => onFocusBlock(block.id)}
            onChange={(e) => onContentChange(block.id, e.target.value)}
            onKeyDown={onTextareaKeyDown}
          />
        </div>
      </div>
    );
  }

  // Text blocks --------------------------------------------------------------
  const cls =
    block.type === "heading1" ? "editor-h1" :
    block.type === "heading2" ? "editor-h2" :
    block.type === "heading3" ? "editor-h3" :
    block.type === "quote" ? "editor-quote" : "editor-paragraph";

  return (
    <div
      className={`editor-block-row group relative flex items-start gap-1.5 ${isOver ? "rounded-[6px] bg-accent-soft" : ""}`}
      style={wrapperStyle}
    >
      <Handle block={block} handlers={handlers} />
      {listMarker()}
      <div
        ref={elRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="false"
        aria-label={block.type === "heading1" ? "Heading" : "Block text"}
        className={`editor-block editor-block-editable flex-1 ${cls} ${checked && block.type === "todoList" ? "opacity-55 line-through" : ""}`}
        data-empty={block.content === "" ? "true" : undefined}
        data-placeholder={block.content === "" ? "Type / for commands" : undefined}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onInput={handleInput}
        onClick={handleClick}
        onKeyDown={onKeyDownLocal}
      />
      {selRect && (
        <FormatToolbar
          x={selRect.x}
          y={selRect.y}
          active={fmtActive}
          onFormat={runFormat}
          linkMode={linkMode}
          linkValue={linkValue}
          onLinkValue={setLinkValue}
          onLinkApply={applyLink}
          onLinkCancel={() => { setLinkMode(false); linkRangeRef.current = null; setSelRect(null); }}
        />
      )}
      {slashQuery !== null && isFocused && (
        <SlashMenu
          query={slashQuery}
          active={slashActive}
          setActive={slashSetActive}
          onSelect={slashSelect}
        />
      )}
    </div>
  );
}

function Handle({ block, handlers }: { block: Block; handlers: EditorHandlers }) {
  return (
    <Menu
      width={190}
      trigger={(open) => (
        <span
          role="button"
          aria-label="Block options"
          className={`block-handle ${open ? "open" : ""}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", block.id);
            handlers.onDragStart(e, block.id);
          }}
        >
          <IconGrip size={14} />
        </span>
      )}
    >
      {(close) => (
        <>
          <MenuItem leading={<IconCopy size={13} />} onClick={() => { handlers.onDuplicate(block.id); close(); }}>
            Duplicate
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger leading={<IconTrash size={13} />} onClick={() => { handlers.onDelete(block.id); close(); }}>
            Delete
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
