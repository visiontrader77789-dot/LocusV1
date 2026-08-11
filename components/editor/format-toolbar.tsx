"use client";

import { useEffect, useRef } from "react";
import {
  IconBold, IconCodeInline, IconItalic, IconLink, IconStrike, IconUnderline,
} from "@/components/icons";

export type FormatCommand = "bold" | "italic" | "underline" | "strikeThrough" | "code" | "link";

export interface FormatActive {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
}

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
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (linkMode) inputRef.current?.focus();
  }, [linkMode]);

  const width = linkMode ? 240 : 208;
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
          <button
            type="button"
            aria-label="Link"
            title="Link  ⌘/Ctrl Shift K"
            className="format-btn"
            onClick={() => onFormat("link")}
          >
            <IconLink size={14} />
          </button>
        </>
      )}
    </div>
  );
}
