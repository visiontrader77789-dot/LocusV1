"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconBold, IconCodeInline, IconEraser, IconHighlighter, IconItalic, IconLink, IconStrike, IconUnderline,
} from "@/components/icons";
import type { HighlightColor } from "@/lib/core/types";

export type FormatCommand =
  | "bold" | "italic" | "underline" | "strikeThrough" | "code" | "link" | "clear"
  | `highlight:${HighlightColor}`
  | "highlight:none";

export interface FormatActive {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  highlight: HighlightColor | null;
}

const HIGHLIGHT_OPTIONS: Array<{ color: HighlightColor; label: string }> = [
  { color: "yellow", label: "Yellow highlight" },
  { color: "green", label: "Green highlight" },
  { color: "pink", label: "Pink highlight" },
  { color: "blue", label: "Blue highlight" },
  { color: "orange", label: "Orange highlight" },
  { color: "purple", label: "Purple highlight" },
];

export function FormatToolbar({
  x,
  y,
  active,
  onFormat,
  linkMode,
  linkValue,
  onLinkValue,
  onLinkApply,
  onLinkCancel,
  linkError,
}: {
  x: number;
  y: number;
  active: FormatActive;
  onFormat: (cmd: FormatCommand) => void;
  linkMode: boolean;
  linkValue: string;
  onLinkValue: (v: string) => void;
  onLinkApply: () => void;
  onLinkCancel: () => void;
  linkError: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hlOpen, setHlOpen] = useState(false);

  useEffect(() => {
    if (linkMode) inputRef.current?.focus();
  }, [linkMode]);

  const width = linkMode ? (linkError ? 264 : 240) : 260;
  const left = Math.max(12, Math.min(x - width / 2, window.innerWidth - width - 12));

  return (
    <div
      className="format-toolbar"
      role="toolbar"
      aria-label="Text formatting"
      style={{ top: Math.max(8, y - 12), left, width }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {linkMode ? (
        <div className="format-link-row">
          <div className="flex-1 min-w-0">
            <input
              ref={inputRef}
              value={linkValue}
              onChange={(e) => onLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onLinkApply();
                if (e.key === "Escape") onLinkCancel();
              }}
              placeholder="Page title or https://…"
              aria-label="Link target"
              spellCheck={false}
              className="format-link-input"
            />
            {linkError && (
              <div className="mt-1 text-[11px] text-danger" role="alert">
                {linkError}
              </div>
            )}
          </div>
          <button type="button" className="format-btn format-btn-ok" aria-label="Apply link" onClick={onLinkApply}>
            Apply
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            aria-label="Bold"
            title="Bold  ⌘/Ctrl B"
            className={`format-btn ${active.bold ? "active" : ""}`}
            onClick={() => onFormat("bold")}
          >
            <IconBold size={14} />
          </button>
          <button
            type="button"
            aria-label="Italic"
            title="Italic  ⌘/Ctrl I"
            className={`format-btn ${active.italic ? "active" : ""}`}
            onClick={() => onFormat("italic")}
          >
            <IconItalic size={14} />
          </button>
          <button
            type="button"
            aria-label="Underline"
            title="Underline  ⌘/Ctrl U"
            className={`format-btn ${active.underline ? "active" : ""}`}
            onClick={() => onFormat("underline")}
          >
            <IconUnderline size={14} />
          </button>
          <button
            type="button"
            aria-label="Strikethrough"
            title="Strikethrough  ⌘/Ctrl Shift X"
            className={`format-btn ${active.strike ? "active" : ""}`}
            onClick={() => onFormat("strikeThrough")}
          >
            <IconStrike size={14} />
          </button>
          <button
            type="button"
            aria-label="Inline code"
            title="Inline code  ⌘/Ctrl E"
            className={`format-btn ${active.code ? "active" : ""}`}
            onClick={() => onFormat("code")}
          >
            <IconCodeInline size={14} />
          </button>
          <span className="format-sep" aria-hidden="true" />
          <span className="relative">
            <button
              type="button"
              aria-label="Highlight"
              title="Highlight"
              className={`format-btn ${active.highlight ? "active" : ""}`}
              onClick={() => setHlOpen((o) => !o)}
            >
              <IconHighlighter size={14} />
            </button>
            {hlOpen && (
              <div
                className="absolute top-full right-0 mt-1 z-50 bg-surface border border-line rounded-[6px] shadow-[var(--shadow-2)] anim-pop p-1.5 w-[164px]"
                role="menu"
                aria-label="Highlight color"
              >
                <div className="px-1 pb-1 eyebrow">Highlight</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {HIGHLIGHT_OPTIONS.map(({ color, label }) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={label}
                      title={label}
                      className={`hl-swatch hl-${color} ${active.highlight === color ? "hl-swatch-on" : ""}`}
                      onClick={() => { onFormat(`highlight:${color}`); setHlOpen(false); }}
                    />
                  ))}
                </div>
                {active.highlight && (
                  <button
                    type="button"
                    className="w-full mt-1.5 h-6.5 px-2 rounded-[5px] text-[11.5px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
                    onClick={() => { onFormat("highlight:none"); setHlOpen(false); }}
                  >
                    Clear highlight
                  </button>
                )}
              </div>
            )}
          </span>
          <button
            type="button"
            aria-label="Link"
            title="Link  ⌘/Ctrl Shift K"
            className="format-btn"
            onClick={() => onFormat("link")}
          >
            <IconLink size={14} />
          </button>
          <span className="format-sep" aria-hidden="true" />
          <button
            type="button"
            aria-label="Clear formatting"
            title="Clear formatting"
            className="format-btn"
            onClick={() => onFormat("clear")}
          >
            <IconEraser size={14} />
          </button>
        </>
      )}
    </div>
  );
}
