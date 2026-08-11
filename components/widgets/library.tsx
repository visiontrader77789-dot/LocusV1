"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WidgetInstance, WidgetType } from "@/lib/core/widgets";
import { WIDGET_CATALOG, WIDGET_CATEGORIES, type WidgetDef } from "./registry";
import { Button, IconBtn, TextField } from "@/components/primitives";
import { IconCheck, IconX } from "@/components/icons";

export function WidgetLibrary({
  open,
  onClose,
  added,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  /** Widget types already placed on the dashboard. */
  added: Set<WidgetType>;
  onAdd: (type: WidgetType) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCategory("All");
  }, [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return WIDGET_CATALOG.filter((def) => {
      if (category !== "All" && def.category !== category) return false;
      if (!q) return true;
      return (
        def.name.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      // Keep Tab inside the dialog.
      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.closest("[inert]"));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    // Focus the panel so the first Tab reaches the first control.
    const t = window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-black/35 anim-fade"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add widgets"
        tabIndex={-1}
        className="relative w-full max-w-[640px] mt-6 sm:mt-12 bg-surface border border-line rounded-[10px] shadow-[var(--shadow-2)] anim-rise outline-none"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line">
          <div>
            <h2 className="font-display font-semibold tracking-tight text-[17px]">Add widgets</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-2">
              Pick widgets to build your workspace. You can remove or rearrange them anytime.
            </p>
          </div>
          <IconBtn label="Close" onClick={onClose} className="shrink-0">
            <IconX size={15} />
          </IconBtn>
        </div>

        <div className="px-5 pt-3 pb-2.5 border-b border-line">
          <TextField
            value={query}
            onChange={setQuery}
            placeholder="Search widgets…"
            ariaLabel="Search widgets"
          />
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            {["All", ...WIDGET_CATEGORIES].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`h-6 px-2.5 rounded-[6px] text-[12px] transition-colors ${
                  category === c
                    ? "bg-accent-soft text-accent font-medium"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[13.5px] text-ink-3">No widgets match “{query}”.</p>
            <p className="mt-1 text-[12px] text-ink-3">Try a different search or category.</p>
          </div>
        ) : (
          <ul className="px-4 py-3 max-h-[54vh] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {items.map((def) => {
              const isAdded = added.has(def.type);
              return (
                <li
                  key={def.type}
                  data-widget-card={def.type}
                  className="flex flex-col rounded-[8px] border border-line bg-surface p-3 transition-colors hover:border-line-strong"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 shrink-0 flex items-center justify-center rounded-[6px] border border-line bg-surface-2 text-ink-2">
                      {def.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 min-w-0">
                        <span className="text-[13.5px] font-medium truncate">{def.name}</span>
                        <span className="font-mono text-[9px] text-ink-3 uppercase tracking-[0.1em] shrink-0">
                          {def.category}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant={isAdded ? "secondary" : "primary"}
                      size="sm"
                      className="shrink-0 min-w-[74px]"
                      disabled={isAdded}
                      onClick={() => onAdd(def.type)}
                    >
                      {isAdded ? (
                        <span className="flex items-center gap-1">
                          <IconCheck size={12} /> Added
                        </span>
                      ) : (
                        "Add"
                      )}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-[12px] text-ink-2 leading-snug">{def.description}</p>
                  <div className="relative mt-2.5 rounded-[6px] border border-line bg-surface-2/60 overflow-hidden">
                    <div inert aria-hidden="true" className="pointer-events-none px-3 pt-3 pb-2">
                      <LivePreview def={def} />
                    </div>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface-2/90 to-transparent"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-line">
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

const noop = () => {};

/** Static, non-interactive live preview of a widget. */
function LivePreview({ def }: { def: WidgetDef }) {
  const Comp = def.component;
  const instance = useMemo<WidgetInstance>(
    () => ({ id: `preview-${def.type}`, type: def.type, size: def.defaultSize, data: {} }),
    [def],
  );
  return <Comp instance={instance} setData={noop} />;
}
