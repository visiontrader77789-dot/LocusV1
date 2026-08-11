"use client";

import { useApp } from "@/lib/store/app";
import { openPalette } from "@/lib/store/events";
import type { Route } from "@/lib/store/router";
import { pathSegments } from "@/lib/core/tree";
import { LocusMark } from "@/components/mark";
import { IconCheck, IconMenu, IconSearch, IconSettings } from "@/components/icons";
import { navigate } from "@/lib/store/router";
import { openMobileSidebar } from "@/lib/store/events";

function SaveStatus() {
  const { saveState } = useApp();
  if (saveState === "idle") return null;
  return (
    <span className="hidden md:inline-flex items-center gap-1.5 font-mono text-[10.5px] text-ink-3">
      {saveState === "saving" && <span className="h-1 w-1 rounded-full bg-ink-3 animate-pulse" />}
      {saveState === "saved" && <IconCheck size={11} className="text-accent" />}
      {saveState === "error" && <span className="h-1 w-1 rounded-full bg-danger" />}
      {saveState === "saving" && "Saving…"}
      {saveState === "saved" && "Saved locally"}
      {saveState === "error" && "Save failed"}
    </span>
  );
}

function Breadcrumb({ route }: { route: Route }) {
  const { pages, pageById, workspace } = useApp();

  if (route.name === "page") {
    const segs = pathSegments(route.id, pages);
    if (segs.length === 0) return <span className="text-ink-3">~/</span>;
    return (
      <span className="flex items-center gap-1 font-mono text-[11.5px] text-ink-2 min-w-0">
        <span className="text-ink-3 shrink-0">~</span>
        <span className="text-ink-3 shrink-0">/</span>
        {segs.map((s, i) => (
          <span key={s.id} className="flex items-center gap-1 min-w-0">
            {i > 0 && <span className="text-ink-3 shrink-0">/</span>}
            <span className={`truncate ${i === segs.length - 1 ? "text-ink" : ""}`}>
              {s.icon ? `${s.icon} ` : ""}
              {s.title}
            </span>
          </span>
        ))}
      </span>
    );
  }

  const names: Record<string, string> = {
    dashboard: "home",
    tasks: "tasks",
    files: "files",
    favorites: "favorites",
    settings: "settings",
    privacy: "privacy",
  };
  return (
    <span className="font-mono text-[11.5px] text-ink-2">
      <span className="text-ink-3">~/</span>
      <span className="text-ink">{names[route.name]}</span>
      <span className="text-ink-3"> · {workspace?.name}</span>
    </span>
  );
}

export function Topbar({ route }: { route: Route }) {
  return (
    <header className="h-[var(--topbar-h)] shrink-0 border-b border-line bg-surface flex items-center gap-2 px-2 sm:px-3 sticky top-0 z-30">
      <button
        type="button"
        className="lg:hidden icon-btn tooltip"
        aria-label="Open menu"
        data-tip="Menu"
        onClick={openMobileSidebar}
      >
        <IconMenu size={17} />
      </button>

      <button
        type="button"
        onClick={() => navigate({ name: "dashboard" })}
        className="hidden md:inline-flex items-center justify-center w-7 h-7 text-accent hover:opacity-80 transition-opacity"
        aria-label="Locus home"
        title="Locus home"
      >
        <LocusMark size={20} />
      </button>

      <div className="flex-1 min-w-0 px-1">
        <Breadcrumb route={route} />
      </div>

      <SaveStatus />

      <button
        type="button"
        onClick={openPalette}
        className="hidden sm:inline-flex items-center gap-2 h-7 px-2.5 rounded-[6px] border border-line bg-surface text-ink-2 text-[12px] hover:border-line-strong hover:text-ink transition-colors"
      >
        <IconSearch size={13} />
        <span className="hidden md:inline">Search</span>
        <span className="font-mono text-[10px] text-ink-3 ml-1">
          {navigator.platform?.includes("Mac") ? "⌘K" : "Ctrl K"}
        </span>
      </button>
      <button
        type="button"
        className="sm:hidden icon-btn"
        aria-label="Search"
        onClick={openPalette}
      >
        <IconSearch size={16} />
      </button>

      <button
        type="button"
        className="icon-btn"
        aria-label="Settings"
        data-tip="Settings"
        onClick={() => navigate({ name: "settings" })}
      >
        <IconSettings size={16} />
      </button>
    </header>
  );
}
