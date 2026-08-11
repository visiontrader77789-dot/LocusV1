"use client";

import { useEffect, useMemo, useRef } from "react";
import type { BlockType } from "@/lib/core/types";
import {
  IconChecklist, IconCode, IconFileText, IconImage, IconList,
  IconListNumbered, IconMinus, IconPage, IconQuote, IconTable,
} from "@/components/icons";

export interface SlashItem {
  type: BlockType;
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
  { type: "bulletList", label: "Bullet list", hint: "Simple list", icon: <IconList size={15} /> },
  { type: "numberedList", label: "Numbered list", hint: "Ordered list", icon: <IconListNumbered size={15} /> },
  { type: "quote", label: "Quote", hint: "A pull quote", icon: <IconQuote size={15} /> },
  { type: "code", label: "Code", hint: "Monospace block", icon: <IconCode size={15} /> },
  { type: "divider", label: "Divider", hint: "A horizontal rule", icon: <IconMinus size={15} /> },
  { type: "image", label: "Image", hint: "An image from your files", icon: <IconImage size={15} /> },
  { type: "file", label: "File", hint: "Attach a file", icon: <IconFileText size={15} /> },
  { type: "table", label: "Table", hint: "Simple grid", icon: <IconTable size={15} /> },
];

const KEYWORDS: Record<string, string> = {
  "/text": "text paragraph plain body",
  "/heading": "heading h1 title",
  "/todo": "todo checklist task checkbox",
  "/bullet": "bullet ul list unordered",
  "/numbered": "numbered ol order list ordered",
  "/quote": "quote blockquote pull",
  "/code": "code block monospace pre",
  "/divider": "divider hr line rule separator",
  "/image": "image img picture",
  "/file": "file attach attachment document",
  "/table": "table grid",
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
  onSelect: (type: BlockType) => void;
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
      <div className="absolute left-0 top-full mt-1 z-30 w-[240px] bg-surface border border-line rounded-[6px] shadow-[var(--shadow-2)] p-3 text-[12.5px] text-ink-3 anim-pop">
        No command for “{query}”. Type Enter to keep it as text.
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-30 w-[260px] bg-surface border border-line rounded-[6px] shadow-[var(--shadow-2)] p-1 max-h-[300px] overflow-y-auto anim-pop"
      role="listbox"
      aria-label="Insert block"
    >
      <div className="px-2.5 pt-1.5 pb-1 eyebrow">Insert block</div>
      {items.map((item, i) => (
        <button
          key={item.type}
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
