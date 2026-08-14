"use client";

import { useEffect, useMemo, useRef } from "react";
import type { BlockType } from "@/lib/core/types";
import {
  IconCalendar, IconChecklist, IconClock, IconCode, IconCopy, IconEraser,
  IconFileText, IconHighlighter, IconImage, IconInfo, IconLink, IconList,
  IconListNumbered, IconMath, IconMinus, IconPage, IconQuote, IconTable,
  IconTrash, IconTriangle,
} from "@/components/icons";

/** Slash commands that aren't block types (they act on the current block). */
export type SlashAction =
  | "link" | "page-link" | "date" | "time" | "highlight"
  | "clear-format" | "duplicate" | "delete";

export type SlashCommand = BlockType | SlashAction;

export const SLASH_ACTIONS = new Set<string>([
  "link", "page-link", "date", "time", "highlight", "clear-format", "duplicate", "delete",
]);

export function isSlashAction(t: SlashCommand): t is SlashAction {
  return SLASH_ACTIONS.has(t);
}

export interface SlashItem {
  type: SlashCommand;
  label: string;
  hint: string;
  icon: React.ReactNode;
}

export const SLASH_ITEMS: SlashItem[] = [
  { type: "paragraph", label: "Text", hint: "Plain paragraph", icon: <IconPage size={15} /> },
  { type: "heading1", label: "Heading 1", hint: "Big section title", icon: <IconPage size={15} /> },
  { type: "heading2", label: "Heading 2", hint: "Section title", icon: <IconPage size={15} /> },
  { type: "heading3", label: "Heading 3", hint: "Subsection", icon: <IconPage size={15} /> },
  { type: "todoList", label: "To-do", hint: "Checkbox list", icon: <IconChecklist size={15} /> },
  { type: "todoList", label: "Checklist", hint: "Tasks with checkboxes", icon: <IconChecklist size={15} /> },
  { type: "bulletList", label: "Bullet list", hint: "Simple list", icon: <IconList size={15} /> },
  { type: "numberedList", label: "Numbered list", hint: "Ordered list", icon: <IconListNumbered size={15} /> },
  { type: "quote", label: "Quote", hint: "A pull quote", icon: <IconQuote size={15} /> },
  { type: "callout", label: "Callout", hint: "A highlighted note", icon: <IconInfo size={15} /> },
  { type: "toggle", label: "Toggle", hint: "Collapsible block", icon: <IconTriangle size={15} /> },
  { type: "code", label: "Code", hint: "Monospace block", icon: <IconCode size={15} /> },
  { type: "math", label: "Math", hint: "LaTeX equation", icon: <IconMath size={15} /> },
  { type: "divider", label: "Divider", hint: "A horizontal rule", icon: <IconMinus size={15} /> },
  { type: "table", label: "Table", hint: "Simple grid", icon: <IconTable size={15} /> },
  { type: "image", label: "Image", hint: "An image from your files", icon: <IconImage size={15} /> },
  { type: "file", label: "File", hint: "Attach a file", icon: <IconFileText size={15} /> },
  { type: "link", label: "Link", hint: "Add a hyperlink", icon: <IconLink size={15} /> },
  { type: "page-link", label: "Page link", hint: "Link to another page", icon: <IconPage size={15} /> },
  { type: "date", label: "Date", hint: "Insert today's date", icon: <IconCalendar size={15} /> },
  { type: "time", label: "Time", hint: "Insert current time", icon: <IconClock size={15} /> },
  { type: "highlight", label: "Highlight", hint: "Highlight what you type", icon: <IconHighlighter size={15} /> },
  { type: "clear-format", label: "Clear formatting", hint: "Remove inline formatting", icon: <IconEraser size={15} /> },
  { type: "duplicate", label: "Duplicate", hint: "Duplicate this block", icon: <IconCopy size={15} /> },
  { type: "delete", label: "Delete", hint: "Delete this block", icon: <IconTrash size={15} /> },
];

const KEYWORDS: Record<string, string> = {
  "/text": "text paragraph plain body",
  "/heading": "heading h1 title",
  "/todo": "todo checklist task checkbox",
  "/checklist": "todo checklist task checkbox",
  "/bullet": "bullet ul list unordered",
  "/numbered": "numbered ol order list ordered",
  "/quote": "quote blockquote pull",
  "/callout": "callout note highlight box tip warning info",
  "/toggle": "toggle collapsible fold hide show disclosure",
  "/code": "code block monospace pre",
  "/math": "math latex equation formula",
  "/divider": "divider hr line rule separator",
  "/image": "image img picture",
  "/file": "file attach attachment document",
  "/table": "table grid",
  "/link": "link url hyperlink anchor",
  "/page-link": "page link reference backlink wikilink",
  "/date": "date today calendar day",
  "/time": "time clock hour minute now",
  "/highlight": "highlight marker mark color pen",
  "/clear-format": "clear format remove formatting erase",
  "/duplicate": "duplicate copy clone",
  "/delete": "delete remove trash discard",
};

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((item) => {
    const words = `${item.label} ${item.hint} ${KEYWORDS[`/${item.type}`] ?? ""}`.toLowerCase();
    return words.includes(q) || item.type.toLowerCase().includes(q);
  });
}

export function SlashMenu({
  query,
  active,
  setActive,
  onSelect,
}: {
  query: string;
  active: number;
  setActive: (i: number) => void;
  onSelect: (type: SlashCommand) => void;
}) {
  const items = useMemo(() => filterSlashItems(query), [query]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active >= items.length) setActive(0);
  }, [items.length, active, setActive]);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-si="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (items.length === 0) {
    return (
      <div className="absolute left-0 top-full mt-1 z-30 w-[240px] max-w-[calc(100vw-24px)] bg-surface border border-line rounded-[6px] shadow-[var(--shadow-2)] p-3 text-[12.5px] text-ink-3 anim-pop">
        No command for “{query}”. Type Enter to keep it as text.
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-30 w-[260px] max-w-[calc(100vw-24px)] bg-surface border border-line rounded-[6px] shadow-[var(--shadow-2)] p-1 max-h-[300px] overflow-y-auto anim-pop"
      role="listbox"
      aria-label="Insert block"
    >
      <div className="px-2.5 pt-1.5 pb-1 eyebrow">Insert block</div>
      {items.map((item, i) => (
        <button
          key={`${item.type}:${item.label}`}
          type="button"
          role="option"
          data-si={i}
          aria-selected={i === active}
          className={`slash-item ${i === active ? "active" : ""}`}
          onMouseMove={() => setActive(i)}
          onClick={() => onSelect(item.type)}
        >
          <span className="w-5 h-5 flex items-center justify-center text-ink-3 shrink-0">
            {item.icon}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block">{item.label}</span>
            <span className="block text-[11px] text-ink-3">{item.hint}</span>
          </span>
          <span className="font-mono text-[10px] text-ink-3">/{item.type}</span>
        </button>
      ))}
    </div>
  );
}
