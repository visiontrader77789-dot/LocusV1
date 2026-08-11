"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WidgetInstance, WidgetType } from "@/lib/core/widgets";
import { uid } from "@/lib/core/util";
import { useApp } from "@/lib/store/app";
import { IconChevronDown, IconChevronUp, IconGrip, IconPlus, IconTrash, IconWidgets } from "@/components/icons";
import { widgetDef } from "./registry";
import { loadWidgets, saveWidgets } from "./state";
import { WidgetLibrary } from "./library";

const SPAN: Record<string, string> = {
  small: "md:col-span-1",
  medium: "md:col-span-2",
};

export function DashboardWidgets() {
  const { workspace } = useApp();
  const workspaceId = workspace?.id ?? null;
  const [instances, setInstances] = useState<WidgetInstance[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const loaded = useRef(false);

  // Load once the workspace is known.
  useEffect(() => {
    if (!workspaceId || loaded.current) return;
    setInstances(loadWidgets(workspaceId));
    loaded.current = true;
  }, [workspaceId]);

  // Persist whenever the layout changes (after the initial load).
  useEffect(() => {
    if (!workspaceId || !loaded.current) return;
    saveWidgets(workspaceId, instances);
  }, [workspaceId, instances]);

  const addWidget = useCallback((type: WidgetType) => {
    const def = widgetDef(type);
    setInstances((prev) => {
      if (prev.some((w) => w.type === type)) return prev; // one of each type
      return [...prev, { id: uid(), type, size: def.defaultSize, data: {} }];
    });
  }, []);

  const removeWidget = useCallback((id: string) => {
    setInstances((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const moveWidget = useCallback((id: string, dir: -1 | 1) => {
    setInstances((prev) => {
      const i = prev.findIndex((w) => w.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const resizeWidget = useCallback((id: string) => {
    setInstances((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        const def = widgetDef(w.type);
        return {
          ...w,
          size: w.size === "small" ? "medium" : def.sizes.length > 1 ? "small" : w.size,
        };
      }),
    );
  }, []);

  const setData = useCallback((id: string, patch: Record<string, string>) => {
    setInstances((prev) =>
      prev.map((w) => (w.id === id ? { ...w, data: { ...w.data, ...patch } } : w)),
    );
  }, []);

  const onDrop = useCallback((targetId: string) => {
    setInstances((prev) => {
      const from = prev.findIndex((w) => w.id === dragging);
      const to = prev.findIndex((w) => w.id === targetId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragging(null);
  }, [dragging]);

  const addedTypes = new Set(instances.map((w) => w.type));

  return (
    <section aria-label="Widgets" className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="eyebrow">Widgets</h2>
        <div className="flex items-center gap-2">
          {instances.length > 0 && (
            <button
              type="button"
              className="text-[12px] text-ink-2 hover:text-ink transition-colors"
              onClick={() => setCustomizing((c) => !c)}
            >
              {customizing ? "Done" : "Customize"}
            </button>
          )}
          <button
            type="button"
            className="flex items-center gap-1 text-[12px] text-ink-2 hover:text-ink transition-colors"
            onClick={() => setLibraryOpen(true)}
          >
            <IconPlus size={12} />
            <span>Add widget</span>
          </button>
        </div>
      </div>

      {instances.length === 0 ? (
        <button
          type="button"
          onClick={() => setLibraryOpen(true)}
          className="panel w-full border-dashed flex flex-col items-center gap-2 py-10 text-ink-2 hover:border-line-strong hover:text-ink transition-colors"
        >
          <IconWidgets size={22} className="text-ink-3" />
          <span className="text-[13px] font-medium">Add a widget to build your workspace</span>
          <span className="text-[12px] text-ink-3">Clocks, timers, notes, stats and more.</span>
        </button>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {instances.map((inst) => {
            const def = widgetDef(inst.type);
            const Comp = def.component;
            return (
              <div
                key={inst.id}
                data-widget-type={inst.type}
                draggable={customizing}
                onDragStart={() => setDragging(inst.id)}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => {
                  if (customizing) e.preventDefault();
                }}
                onDrop={() => onDrop(inst.id)}
                className={`panel relative ${SPAN[inst.size]} ${
                  customizing ? "ring-1 ring-accent/40" : ""
                } ${dragging === inst.id ? "opacity-40" : ""} transition-all`}
              >
                <Comp instance={inst} setData={(patch) => setData(inst.id, patch)} />

                {customizing && (
                  <div
                    className="absolute inset-x-0 top-0 flex items-center justify-center rounded-t-[6px] bg-ink/85 text-paper py-1 px-2 gap-1.5"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <IconGrip size={13} className="text-paper/50" />
                    <button
                      type="button"
                      aria-label={`Move ${def.name} up`}
                      className="text-paper/75 hover:text-paper p-0.5"
                      onClick={() => moveWidget(inst.id, -1)}
                    >
                      <IconChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${def.name} down`}
                      className="text-paper/75 hover:text-paper p-0.5"
                      onClick={() => moveWidget(inst.id, 1)}
                    >
                      <IconChevronDown size={14} />
                    </button>
                    {def.sizes.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Resize ${def.name}`}
                        className="text-paper/75 hover:text-paper p-0.5"
                        onClick={() => resizeWidget(inst.id)}
                      >
                        <IconWidgets size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${def.name}`}
                      className="text-danger hover:text-paper p-0.5"
                      onClick={() => removeWidget(inst.id)}
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <WidgetLibrary
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        added={addedTypes}
        onAdd={addWidget}
      />
    </section>
  );
}
