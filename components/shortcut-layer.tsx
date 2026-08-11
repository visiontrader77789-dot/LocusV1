"use client";

import { useCallback, useEffect, useRef } from "react";
import { useApp } from "@/lib/store/app";
import { navigate, type Route } from "@/lib/store/router";
import {
  closePalette, onPaletteClose, onPaletteOpen, openMobileSidebar, openPalette,
  requestPageRename, toggleSidebar,
} from "@/lib/store/events";
import { collectDescendants } from "@/lib/core/tree";
import { attachShortcutHandler } from "@/lib/shortcuts/handler";
import { effectiveShortcuts } from "@/lib/shortcuts/overrides";
import { requestShortcutsHelpFocus, validateShortcuts } from "@/lib/shortcuts/registry";

/**
 * Mounted once inside the app shell. Owns the single global keydown listener
 * and maps shortcut ids to store actions. Renders nothing.
 */
export function ShortcutLayer({ route }: { route: Route }) {
  const app = useApp();
  const appRef = useRef(app);
  appRef.current = app;
  const routeRef = useRef(route);
  routeRef.current = route;
  const paletteOpenRef = useRef(false);

  useEffect(() => onPaletteOpen(() => { paletteOpenRef.current = true; }), []);
  useEffect(() => onPaletteClose(() => { paletteOpenRef.current = false; }), []);

  const runShortcut = useCallback((id: string) => {
    const a = appRef.current;
    const r = routeRef.current;

    switch (id) {
      case "search":
        openPalette();
        return;
      case "save":
        a.pushNotice("success", "All changes saved");
        return;
      case "settings":
        navigate({ name: "settings" });
        return;
      case "shortcuts-help":
        requestShortcutsHelpFocus();
        navigate({ name: "settings" });
        return;
      case "close":
        if (a.confirmState) a.closeConfirm();
        else if (paletteOpenRef.current) closePalette();
        return;
      case "new-page":
        void a.createPage(null).then((p) => navigate({ name: "page", id: p.id }));
        return;
      case "new-task":
        openPalette("task");
        return;
      case "new-folder":
        void a.createFolder(null).then(() => a.pushNotice("success", "Folder created"));
        return;
      case "go-dashboard":
        navigate({ name: "dashboard" });
        return;
      case "go-tasks":
        navigate({ name: "tasks" });
        return;
      case "go-files":
        navigate({ name: "files" });
        return;
      case "go-favorites":
        navigate({ name: "favorites" });
        return;
      case "page-rename":
        if (r.name === "page") requestPageRename();
        return;
      case "page-duplicate":
        if (r.name === "page") {
          void a.duplicatePage(r.id).then((copy) => {
            if (copy) navigate({ name: "page", id: copy.id });
          });
        }
        return;
      case "page-favorite":
        if (r.name === "page") void a.toggleFavoritePage(r.id);
        return;
      case "page-delete": {
        if (r.name !== "page") return;
        const page = a.pageById.get(r.id);
        if (!page) return;
        const descendants = collectDescendants(r.id, a.pages, true).length;
        a.confirm({
          title: "Delete this page?",
          body:
            descendants > 1
              ? `"${page.title}" and ${descendants - 1} nested page${descendants - 1 > 1 ? "s" : ""} will be deleted. Tasks keep existing but are unlinked. This can't be undone.`
              : `"${page.title}" will be deleted. This can't be undone.`,
          confirmLabel: "Delete",
          danger: true,
          onConfirm: () => void a.deletePage(page.id),
        });
        return;
      }
      case "sidebar-toggle":
        if (typeof window !== "undefined" && window.innerWidth >= 1024) toggleSidebar();
        else openMobileSidebar();
        return;
    }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const warnings = validateShortcuts(effectiveShortcuts());
      for (const w of warnings) console.warn(`[shortcuts] ${w}`);
    }
    const actions = effectiveShortcuts()
      .filter((def) => !def.editorOwned)
      .map((def) => ({ def, run: () => runShortcut(def.id) }));
    return attachShortcutHandler(actions);
  }, [runShortcut]);

  return null;
}
