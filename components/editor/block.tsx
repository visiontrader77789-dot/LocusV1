"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Block, BlockType, CalloutType, FileRef, HighlightColor, InlineSpan } from "@/lib/core/types";
import { formatBytes, isValidLinkTarget } from "@/lib/core/util";
import { escapeHtml, readBlock, renderMath, richHtml, sanitizePasteHtml } from "@/lib/core/rich";
import {
  IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight, IconChevronUp, IconCopy, IconDownload,
  IconFileOther, IconGrip, IconPen, IconTrash,
} from "@/components/icons";
import { Menu, MenuItem, MenuSeparator } from "@/components/primitives";
import { SlashMenu, type SlashCommand } from "./slash-menu";
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
  onMove: (blockId: string, dir: "up" | "down") => void;
  onCopyText: (blockId: string) => void;
  onDragStart: (e: React.DragEvent, blockId: string) => void;
  onDropBlock: (e: React.DragEvent, blockId: string) => void;
  onDragOverBlock: (e: React.DragEvent, blockId: string) => void;
  /** arrow at an edge: move focus to the neighbour block */
  onRequestFocus: (blockId: string, edge: "start" | "end") => void;
  /** caret at the very start of a text block: merge into / delete the previous block */
  onBackspaceAtStart: (blockId: string) => void;
  onOpenLink: (title: string) => void;
  getBlobUrl: (file: FileRef) => Promise<string | null>;
  slashSelect: (type: SlashCommand) => void;
  slashSetActive: (i: number) => void;
  slashClose: () => void;
}

export interface EditorBlockProps {
  block: Block;
  handlers: EditorHandlers;
  number: number | null;
  /** the file attached to this block, if any */
  file: FileRef | undefined;
  focused: boolean;
  slash: { query: string; active: number } | null;
  /** focus request dispatched by the editor (e.g. after creating a block) */
  caretTarget: { id: string; at: "start" | "end"; seq: number; mode?: "highlight" | "link" } | null;
  dragOverPos: "before" | "after" | null;
  firstBlock: boolean;
  lastBlock: boolean;
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

function selectionHighlightColor(_el: HTMLElement): HighlightColor | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const m = startEl?.closest("mark")?.className.match(/hl-(yellow|green|pink|blue|orange|purple)/);
  return m ? (m[1] as HighlightColor) : null;
}

function unwrapMark(mark: HTMLElement): void {
  const parent = mark.parentNode;
  if (!parent) return;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
}

/** Merge adjacent sibling marks that share the same color (cosmetic cleanup). */
function mergeAdjacentMarks(el: HTMLElement): void {
  const marks = Array.from(el.querySelectorAll("mark"));
  for (const mark of marks) {
    const next = mark.nextSibling;
    if (next instanceof Element && next.tagName === "MARK" && next.className === mark.className) {
      while (next.firstChild) mark.appendChild(next.firstChild);
      next.remove();
    }
  }
}

/** Unwrap <mark> highlights that overlap the current selection (clear formatting). */
function unwrapHighlightsInSelection(el: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const marks = Array.from(el.querySelectorAll("mark"));
  for (const mark of marks) {
    if (!range.intersectsNode(mark)) continue;
    unwrapMark(mark);
  }
  mergeAdjacentMarks(el);
}

// removeFormat can leave empty inline wrappers (<b></b>); drop them so the
// model serializes cleanly. Process deepest-first: querySelectorAll returns
// pre-order (outermost first), so a nested empty like <b><i></i></b> would be
// skipped — the outer still has a child while the inner is removed later.
function stripEmptyInlineElements(el: HTMLElement): void {
  const empty = Array.from(el.querySelectorAll("b, i, u, s, strike, em, strong, code, mark")).reverse();
  for (const node of empty) {
    if (node.textContent === "" && node.childElementCount === 0) {
      node.parentNode?.removeChild(node);
    }
  }
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

// ---- Callout metadata ------------------------------------------------------

const CALLOUT_META: Record<CalloutType, { emoji: string; label: string }> = {
  info: { emoji: "ℹ️", label: "Info" },
  success: { emoji: "✅", label: "Success" },
  warning: { emoji: "⚠️", label: "Warning" },
  danger: { emoji: "❌", label: "Danger" },
  tip: { emoji: "💡", label: "Tip" },
  note: { emoji: "📝", label: "Note" },
};
const CALLOUT_META_LIST: Array<{ type: CalloutType; emoji: string; label: string }> = (
  Object.keys(CALLOUT_META) as CalloutType[]
).map((t) => ({ type: t, ...CALLOUT_META[t] }));

// ---- Code block language options -------------------------------------------

const CODE_LANGUAGES: Array<{ value: string; label: string }> = [
  { value: "", label: "Plain text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "scss", label: "SCSS" },
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "python", label: "Python" },
  { value: "bash", label: "Bash" },
  { value: "shell", label: "Shell" },
  { value: "sql", label: "SQL" },
  { value: "yaml", label: "YAML" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "swift", label: "Swift" },
  { value: "kotlin", label: "Kotlin" },
  { value: "dart", label: "Dart" },
];

const TURN_INTO_OPTIONS: Array<{ type: BlockType; label: string }> = [
  { type: "paragraph", label: "Text" },
  { type: "heading1", label: "Heading 1" },
  { type: "heading2", label: "Heading 2" },
  { type: "heading3", label: "Heading 3" },
  { type: "bulletList", label: "Bullet list" },
  { type: "numberedList", label: "Numbered list" },
  { type: "todoList", label: "To-do list" },
  { type: "quote", label: "Quote" },
  { type: "callout", label: "Callout" },
  { type: "code", label: "Code" },
];

// ---- Editor block ----------------------------------------------------------

export const EditorBlock = memo(function EditorBlock(props: EditorBlockProps) {
  const {
    block, handlers, number, file, focused, slash, caretTarget, dragOverPos, firstBlock, lastBlock,
  } = props;
  const {
    onContentChange, onPatch, onKeyDown, onFocusBlock, onBlurBlock, onTypeChange,
    onDropBlock, onDragOverBlock, onRequestFocus, onBackspaceAtStart, onOpenLink,
    getBlobUrl, slashSelect, slashSetActive,
  } = handlers;

  const elRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isFocused = focused;
  const [checked, setChecked] = useState(block.checked);
  const blobUrl = useBlobUrl(file, getBlobUrl);

  // Contextual formatting toolbar state.
  const [selRect, setSelRect] = useState<{ x: number; y: number } | null>(null);
  const [fmtActive, setFmtActive] = useState<FormatActive>({
    bold: false, italic: false, underline: false, strike: false, code: false, highlight: null,
  });
  const [linkMode, setLinkMode] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  // Mirror of linkMode for the DOM listener (effect closure) below.
  const linkModeRef = useRef(false);
  linkModeRef.current = linkMode;
  // Selection captured when link mode opens; the input steals focus, so the
  // live selection is unavailable by the time Apply runs.
  const linkRangeRef = useRef<Range | null>(null);

  useEffect(() => { setChecked(block.checked); }, [block.checked]);

  // ---- reading the DOM back into content + spans --------------------------
  const syncModel = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const { content, spans } = readBlock(el);
    onContentChange(block.id, content, spans);
  }, [block.id, onContentChange]);

  // ---- programmatic focus (new block, merging, transforms) ----------------
  // Only re-runs when a new focus is requested (caretTarget identity changes);
  // content/rich changes while typing are already reflected in the DOM and must
  // not re-trigger an innerHTML rebuild (it would snap the caret and race with
  // live selections).
  useEffect(() => {
    if (!caretTarget) return;
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
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        return;
      }
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(caretTarget.at === "start");
      if (caretTarget.mode === "highlight") {
        const mark = document.createElement("mark");
        mark.className = "hl-yellow";
        range.insertNode(mark);
        const r2 = document.createRange();
        r2.selectNodeContents(mark);
        r2.collapse(true);
        const s2 = window.getSelection();
        s2?.removeAllRanges();
        s2?.addRange(r2);
      } else if (caretTarget.mode === "link") {
        const a = document.createElement("a");
        a.className = "inline-link";
        a.setAttribute("data-link", "https://");
        a.textContent = "https://";
        range.insertNode(a);
        const r2 = document.createRange();
        r2.setStart(a, 1);
        r2.collapse(true);
        const s2 = window.getSelection();
        s2?.removeAllRanges();
        s2?.addRange(r2);
      } else {
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
    return () => window.clearTimeout(t);
  }, [caretTarget, block.id]);

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

  const handlePaste = (e: React.ClipboardEvent) => {
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    if (!html && !text) return;
    e.preventDefault();
    const safe = html
      ? sanitizePasteHtml(html)
      : escapeHtml(text).replace(/\n/g, "<br>");
    document.execCommand("insertHTML", false, safe);
    window.requestAnimationFrame(() => syncModel());
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
    setLinkError(null);
    setLinkMode(true);
  };

  const applyHighlight = (el: HTMLElement, color: HighlightColor | null) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const startEl = range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;

    if (!color) {
      // Clear: unwrap every mark the caret/selection touches.
      if (range.collapsed) {
        const markEl = startEl?.closest("mark");
        if (markEl) unwrapMark(markEl);
      } else {
        const marks = Array.from(el.querySelectorAll("mark"));
        for (const mark of marks) {
          if (range.intersectsNode(mark)) unwrapMark(mark);
        }
      }
      mergeAdjacentMarks(el);
      return;
    }

    if (range.collapsed) {
      const markEl = startEl?.closest("mark");
      if (markEl) {
        // Caret is already inside a highlight: retarget its color.
        markEl.className = `hl-${color}`;
        return;
      }
      // Open an empty highlight run so typing stays highlighted.
      const mark = document.createElement("mark");
      mark.className = `hl-${color}`;
      range.insertNode(mark);
      const sel2 = window.getSelection();
      const r2 = document.createRange();
      r2.selectNodeContents(mark);
      r2.collapse(true);
      sel2?.removeAllRanges();
      sel2?.addRange(r2);
      return;
    }

    // Non-collapsed: wrap the selection contents in a mark WITHOUT flattening
    // the inner formatting (bold/italic/code/links must survive).
    const frag = range.extractContents();
    // Unwrap any existing highlight marks inside the selection so the new
    // color applies cleanly instead of nesting marks inside marks.
    frag.querySelectorAll("mark").forEach((m) => unwrapMark(m as HTMLElement));
    const mark = document.createElement("mark");
    mark.className = `hl-${color}`;
    mark.appendChild(frag);
    range.insertNode(mark);
    mergeAdjacentMarks(el);
    const sel2 = window.getSelection();
    const r2 = document.createRange();
    r2.setStartAfter(mark);
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
    } else if (cmd === "clear") {
      document.execCommand("removeFormat", false);
      unwrapHighlightsInSelection(el);
      stripEmptyInlineElements(el);
    } else {
      document.execCommand(cmd, false);
    }
    window.requestAnimationFrame(() => syncModel());
  };

  const applyLink = () => {
    const target = linkValue.trim();
    if (!isValidLinkTarget(target)) {
      setLinkError("Only http(s), mailto or ftp links are allowed.");
      return;
    }
    setLinkError(null);
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
    // While the slash menu is open the vertical arrows navigate the menu, so
    // don't let the edge handlers move focus between blocks.
    if (el && !slash && e.key === "ArrowUp" && caretEdges(el).atStart) {
      e.preventDefault();
      onRequestFocus(block.id, "start");
      return;
    }
    if (el && !slash && e.key === "ArrowDown" && caretEdges(el).atEnd) {
      e.preventDefault();
      onRequestFocus(block.id, "end");
      return;
    }
    if (el && e.key === "ArrowLeft" && caretEdges(el).atStart) {
      e.preventDefault();
      onRequestFocus(block.id, "start");
      return;
    }
    if (el && e.key === "ArrowRight" && caretEdges(el).atEnd) {
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
    if (ta && e.key === "ArrowLeft" && ta.selectionStart === 0) {
      e.preventDefault();
      onRequestFocus(block.id, "start");
      return;
    }
    if (ta && e.key === "ArrowRight" && ta.selectionEnd === ta.value.length) {
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
  const isOver = dragOverPos !== null;
  const dragIndicator = dragOverPos ? <DragLine pos={dragOverPos} /> : null;
  const placeholder = block.content === "" ? (firstBlock ? "Start writing…" : "Type / for commands") : undefined;

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
          {checked && <IconCheck size={11} className="editor-check-pop" />}
        </button>
      );
    }
    return null;
  };

  // Non-text block types ----------------------------------------------------
  if (block.type === "divider") {
    return (
      <div className="editor-block-row group relative" style={wrapperStyle}>
        <Handle block={block} handlers={handlers} firstBlock={firstBlock} lastBlock={lastBlock} />
        {dragIndicator}
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
        <Handle block={block} handlers={handlers} firstBlock={firstBlock} lastBlock={lastBlock} />
        {dragIndicator}
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
        <Handle block={block} handlers={handlers} firstBlock={firstBlock} lastBlock={lastBlock} />
        {dragIndicator}
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
        <Handle block={block} handlers={handlers} firstBlock={firstBlock} lastBlock={lastBlock} />
        {dragIndicator}
        <div className={`code-block w-full ${isOver ? "border-accent" : ""}`} onDragOver={dragOver} onDrop={(e) => onDropBlock(e, block.id)}>
          <CodeHeader block={block} onPatch={onPatch} />
          <textarea
            ref={taRef}
            value={block.content}
            rows={Math.max(2, block.content.split("\n").length)}
            spellCheck={false}
            placeholder="Type or paste code…"
            aria-label="Code block"
            className="editor-block editor-code !h-auto !my-0 resize-y w-full !rounded-none !border-0 bg-transparent"
            onFocus={() => onFocusBlock(block.id)}
            onInput={() => onFocusBlock(block.id)}
            onChange={(e) => onContentChange(block.id, e.target.value)}
            onKeyDown={onTextareaKeyDown}
          />
        </div>
      </div>
    );
  }

  if (block.type === "math") {
    const previewHtml = renderMath(block.content, true);
    return (
      <div className="editor-block-row group relative" style={wrapperStyle}>
        <Handle block={block} handlers={handlers} firstBlock={firstBlock} lastBlock={lastBlock} />
        {dragIndicator}
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

  if (block.type === "callout") {
    const ct = block.calloutType ?? "note";
    const meta = CALLOUT_META[ct];
    return (
      <div className="editor-block-row group relative" style={wrapperStyle}>
        <Handle block={block} handlers={handlers} firstBlock={firstBlock} lastBlock={lastBlock} />
        {dragIndicator}
        <div
          className={`editor-callout flex-1 min-w-0 ${isOver ? "border-accent" : ""}`}
          data-callout={ct}
          onDragOver={dragOver}
          onDrop={(e) => onDropBlock(e, block.id)}
        >
          <CalloutTypeButton block={block} onPatch={onPatch} />
          <div
            ref={elRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="false"
            aria-label={`${meta.label} callout`}
            className="editor-block editor-block-editable flex-1 min-w-0 editor-paragraph"
            data-empty={block.content === "" ? "true" : undefined}
            data-placeholder={placeholder}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onInput={handleInput}
            onClick={handleClick}
            onPaste={handlePaste}
            onKeyDown={onKeyDownLocal}
          />
        </div>
        {selRect && (
          <FormatToolbar
            x={selRect.x}
            y={selRect.y}
            active={fmtActive}
            onFormat={runFormat}
            linkMode={linkMode}
            linkValue={linkValue}
            linkError={linkError}
            onLinkValue={(v) => { setLinkValue(v); setLinkError(null); }}
            onLinkApply={applyLink}
            onLinkCancel={() => { setLinkMode(false); linkRangeRef.current = null; setSelRect(null); }}
          />
        )}
        {slash && (
          <SlashMenu
            query={slash.query}
            active={slash.active}
            setActive={slashSetActive}
            onSelect={slashSelect}
          />
        )}
      </div>
    );
  }

  // Toggle block -------------------------------------------------------------
  if (block.type === "toggle") {
    const collapsed = block.collapsed ?? false;
    return (
      <div className="editor-block-row group relative flex items-start gap-1.5" style={wrapperStyle}>
        <Handle block={block} handlers={handlers} firstBlock={firstBlock} lastBlock={lastBlock} />
        {dragIndicator}
        <button
          type="button"
          aria-label={collapsed ? "Expand toggle" : "Collapse toggle"}
          aria-expanded={!collapsed}
          onClick={() => onPatch(block.id, { collapsed: !collapsed })}
          className="toggle-chevron mt-[7px] flex-none w-4 h-4 flex items-center justify-center rounded-[4px] text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors"
        >
          <IconChevronRight size={13} className={collapsed ? "" : "rotate-90 transition-transform"} />
        </button>
        <div
          ref={elRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="false"
          aria-label="Toggle text"
          className={`editor-block editor-block-editable flex-1 editor-paragraph ${collapsed ? "editor-toggle-collapsed" : ""}`}
          data-empty={block.content === "" ? "true" : undefined}
          data-placeholder={placeholder}
          onFocus={() => {
            if (block.collapsed) onPatch(block.id, { collapsed: false });
            handleFocus();
          }}
          onBlur={handleBlur}
          onInput={handleInput}
          onClick={handleClick}
          onPaste={handlePaste}
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
            linkError={linkError}
            onLinkValue={(v) => { setLinkValue(v); setLinkError(null); }}
            onLinkApply={applyLink}
            onLinkCancel={() => { setLinkMode(false); linkRangeRef.current = null; setSelRect(null); }}
          />
        )}
        {slash && (
          <SlashMenu
            query={slash.query}
            active={slash.active}
            setActive={slashSetActive}
            onSelect={slashSelect}
          />
        )}
      </div>
    );
  }

  // Text blocks --------------------------------------------------------------
  const cls =
    block.type === "heading1" ? "editor-h1" :
    block.type === "heading2" ? "editor-h2" :
    block.type === "heading3" ? "editor-h3" :
    block.type === "quote" ? "editor-quote" : "editor-paragraph";
  const heading = block.type === "heading1" || block.type === "heading2" || block.type === "heading3";

  return (
    <div
      className={`editor-block-row group relative flex items-start gap-1.5 ${isOver ? "rounded-[6px] bg-accent-soft" : ""}`}
      style={wrapperStyle}
      onDragOver={dragOver}
      onDrop={(e) => onDropBlock(e, block.id)}
    >
      <Handle block={block} handlers={handlers} firstBlock={firstBlock} lastBlock={lastBlock} />
      {dragIndicator}
      {listMarker()}
      <div
        ref={elRef}
        contentEditable
        suppressContentEditableWarning
        role={heading ? "heading" : "textbox"}
        aria-level={heading ? Number(block.type.slice(-1)) : undefined}
        aria-multiline="false"
        aria-label={heading ? "Heading" : "Block text"}
        className={`editor-block editor-block-editable flex-1 ${cls} ${checked && block.type === "todoList" ? "opacity-55 line-through" : ""}`}
        data-empty={block.content === "" ? "true" : undefined}
        data-placeholder={placeholder}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onInput={handleInput}
        onClick={handleClick}
        onPaste={handlePaste}
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
          linkError={linkError}
          onLinkValue={(v) => { setLinkValue(v); setLinkError(null); }}
          onLinkApply={applyLink}
          onLinkCancel={() => { setLinkMode(false); linkRangeRef.current = null; setSelRect(null); }}
        />
      )}
      {slash && (
        <SlashMenu
          query={slash.query}
          active={slash.active}
          setActive={slashSetActive}
          onSelect={slashSelect}
        />
      )}
    </div>
  );
}, areEqual);

function areEqual(prev: EditorBlockProps, next: EditorBlockProps): boolean {
  return (
    prev.block === next.block &&
    prev.number === next.number &&
    prev.file === next.file &&
    prev.focused === next.focused &&
    prev.firstBlock === next.firstBlock &&
    prev.lastBlock === next.lastBlock &&
    prev.dragOverPos === next.dragOverPos &&
    prev.handlers === next.handlers &&
    prev.caretTarget === next.caretTarget &&
    prev.slash === next.slash
  );
}

// ---- Drag indicator ---------------------------------------------------------

function DragLine({ pos }: { pos: "before" | "after" }) {
  return (
    <div
      aria-hidden="true"
      className="editor-drag-line absolute left-0 right-0 z-20 pointer-events-none"
      style={pos === "before" ? { top: -1 } : { bottom: -1 }}
    />
  );
}

// ---- Callout type picker ----------------------------------------------------

function CalloutTypeButton({ block, onPatch }: { block: Block; onPatch: (id: string, patch: Partial<Block>) => void }) {
  const ct = block.calloutType ?? "note";
  const meta = CALLOUT_META[ct];
  return (
    <Menu
      width={180}
      align="start"
      trigger={(open) => (
        <span
          role="button"
          aria-label={`Callout type: ${meta.label}`}
          title={`Callout type: ${meta.label}`}
          className={`callout-type-btn ${open ? "open" : ""}`}
        >
          {meta.emoji}
        </span>
      )}
    >
      {(close) => (
        <>
          {CALLOUT_META_LIST.map((m) => (
            <MenuItem
              key={m.type}
              active={ct === m.type}
              leading={<span className="text-[13px] leading-none">{m.emoji}</span>}
              onClick={() => { onPatch(block.id, { calloutType: m.type }); close(); }}
            >
              {m.label}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  );
}

// ---- Code block header ------------------------------------------------------

function CodeHeader({ block, onPatch }: { block: Block; onPatch: (id: string, patch: Partial<Block>) => void }) {
  const [copied, setCopied] = useState(false);
  const doCopy = () => {
    if (!block.content) return;
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(block.content).then(done, () => {});
    }
  };
  return (
    <div className="code-block-header">
      <select
        value={block.language ?? ""}
        aria-label="Code language"
        className="code-lang-select"
        onChange={(e) => onPatch(block.id, { language: e.target.value || undefined })}
      >
        {CODE_LANGUAGES.map((l) => (
          <option key={l.value || "plaintext"} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={`code-copy-btn ${copied ? "copied" : ""}`}
        aria-label={copied ? "Copied" : "Copy code"}
        onClick={doCopy}
      >
        <IconCopy size={12} />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// ---- Block handle menu ------------------------------------------------------

function Handle({ block, handlers, firstBlock, lastBlock }: { block: Block; handlers: EditorHandlers; firstBlock: boolean; lastBlock: boolean }) {
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<"main" | "types">("main");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => { setOpen(false); setPane("main"); };

  return (
    <div className="relative" ref={ref}>
      <span
        role="button"
        aria-label="Block options"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`block-handle ${open ? "open" : ""}`}
        onClick={() => { setOpen((o) => !o); setPane("main"); }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", block.id);
          handlers.onDragStart(e, block.id);
        }}
      >
        <IconGrip size={14} />
      </span>
      {open && (
        <div
          className="absolute left-0 top-full z-40 mt-1 bg-surface border border-line rounded-[6px] shadow-[var(--shadow-2)] anim-pop p-1 w-[200px]"
          role="menu"
          aria-label="Block options"
        >
          {pane === "main" ? (
            <>
              <MenuItem leading={<IconPen size={13} />} onClick={() => setPane("types")}>
                Turn into
              </MenuItem>
              <MenuSeparator />
              <MenuItem leading={<IconChevronUp size={13} />} disabled={firstBlock} onClick={() => { handlers.onMove(block.id, "up"); close(); }}>
                Move up
              </MenuItem>
              <MenuItem leading={<IconChevronDown size={13} />} disabled={lastBlock} onClick={() => { handlers.onMove(block.id, "down"); close(); }}>
                Move down
              </MenuItem>
              <MenuItem leading={<IconCopy size={13} />} onClick={() => { handlers.onCopyText(block.id); close(); }}>
                Copy text
              </MenuItem>
              <MenuItem leading={<IconCopy size={13} />} onClick={() => { handlers.onDuplicate(block.id); close(); }}>
                Duplicate
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger leading={<IconTrash size={13} />} onClick={() => { handlers.onDelete(block.id); close(); }}>
                Delete
              </MenuItem>
            </>
          ) : (
            <>
              <div className="flex items-center gap-0.5 pt-0.5 pb-1">
                <button
                  type="button"
                  aria-label="Back to block options"
                  className="flex items-center justify-center w-6 h-6 rounded-[4px] text-ink-3 hover:bg-surface-2 hover:text-ink transition-colors"
                  onClick={() => setPane("main")}
                >
                  <IconChevronLeft size={13} />
                </button>
                <div className="eyebrow">Turn into</div>
              </div>
              {TURN_INTO_OPTIONS.map((o) => (
                <MenuItem
                  key={o.type}
                  active={block.type === o.type}
                  onClick={() => { handlers.onTypeChange(block.id, o.type); close(); }}
                >
                  {o.label}
                </MenuItem>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
