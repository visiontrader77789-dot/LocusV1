import type { ShortcutDef } from "./types";

/**
 * The built-in shortcut table.
 *
 * Global combos are dispatched by the shortcut layer. Editor combos are marked
 * `editorOwned`: the editor implements them itself (they need live selection
 * access) and they are listed here so the help screen and conflict detection
 * see the full picture.
 *
 * Safety rules applied while choosing keys:
 * - never override browser essentials: Ctrl/Cmd+L, T, W, R, F5,
 *   Ctrl/Cmd+Shift+I, Ctrl/Cmd+plus/minus/0 (zoom/reset);
 * - avoid Ctrl/Cmd+1..9 (browser tab switching) and Ctrl/Cmd+Shift+T
 *   (reopen closed tab) where possible;
 * - the handler preventDefaults every matched combo, so within Locus the
 *   browser default is always suppressed.
 */

export const BUILTIN_SHORTCUTS: ShortcutDef[] = [
  // ---- General ------------------------------------------------------------
  {
    id: "search",
    label: "Search everything",
    group: "General",
    combos: [{ key: "k", mod: true }, { key: "p", mod: true }],
    whenEditable: true,
    description: "Open the command palette.",
  },
  {
    id: "save",
    label: "Save now",
    group: "General",
    combos: [{ key: "s", mod: true }],
    whenEditable: true,
    description: "Locus already autosaves; this flushes and confirms.",
  },
  {
    id: "settings",
    label: "Open settings",
    group: "General",
    combos: [{ key: ",", mod: true }],
  },
  {
    id: "shortcuts-help",
    label: "Keyboard shortcuts",
    group: "General",
    combos: [{ key: "/", mod: true }],
    description: "Open settings and jump to this list.",
  },
  {
    id: "close",
    label: "Close / cancel",
    group: "General",
    combos: [{ key: "escape" }],
    whenEditable: true,
    description: "Close the confirm dialog, command palette or any open menu.",
  },

  // ---- Create -------------------------------------------------------------
  {
    id: "new-page",
    label: "New page",
    group: "Create",
    combos: [{ key: "n", mod: true }],
  },
  {
    id: "new-task",
    label: "New task",
    group: "Create",
    combos: [{ key: "n", mod: true, shift: true }],
  },
  {
    id: "new-folder",
    label: "New folder",
    group: "Create",
    combos: [{ key: "f", mod: true, alt: true }],
  },

  // ---- Navigate -----------------------------------------------------------
  {
    id: "go-dashboard",
    label: "Go to dashboard",
    group: "Navigate",
    combos: [{ key: "h", mod: true, shift: true }],
  },
  {
    id: "go-tasks",
    label: "Go to tasks",
    group: "Navigate",
    combos: [{ key: "t", mod: true, shift: true }],
  },
  {
    id: "go-files",
    label: "Go to files",
    group: "Navigate",
    combos: [{ key: "f", mod: true, shift: true }],
  },
  {
    id: "go-favorites",
    label: "Go to favorites",
    group: "Navigate",
    combos: [{ key: "s", mod: true, shift: true }],
  },

  // ---- Page actions -------------------------------------------------------
  {
    id: "page-rename",
    label: "Rename page",
    group: "Page",
    route: "page",
    combos: [{ key: "f2" }],
  },
  {
    id: "page-duplicate",
    label: "Duplicate page",
    group: "Page",
    route: "page",
    combos: [{ key: "d", mod: true, shift: true }],
  },
  {
    id: "page-favorite",
    label: "Toggle favorite",
    group: "Page",
    route: "page",
    combos: [{ key: "b", mod: true, shift: true }],
  },
  {
    id: "page-delete",
    label: "Delete page",
    group: "Page",
    route: "page",
    combos: [{ key: "delete" }],
    destructive: true,
  },

  // ---- Sidebar ------------------------------------------------------------
  {
    id: "sidebar-toggle",
    label: "Toggle sidebar",
    group: "Sidebar",
    combos: [{ key: "\\", mod: true }],
    description: "Collapses/expands the sidebar on desktop; opens the drawer on mobile.",
  },

  // ---- Editor (implemented inside the editor) -----------------------------
  {
    id: "editor-bold",
    label: "Bold",
    group: "Editor",
    editorOwned: true,
    combos: [{ key: "b", mod: true }],
  },
  {
    id: "editor-italic",
    label: "Italic",
    group: "Editor",
    editorOwned: true,
    combos: [{ key: "i", mod: true }],
  },
  {
    id: "editor-underline",
    label: "Underline",
    group: "Editor",
    editorOwned: true,
    combos: [{ key: "u", mod: true }],
  },
  {
    id: "editor-code",
    label: "Inline code",
    group: "Editor",
    editorOwned: true,
    combos: [{ key: "e", mod: true }],
  },
  {
    id: "editor-strike",
    label: "Strikethrough",
    group: "Editor",
    editorOwned: true,
    combos: [{ key: "x", mod: true, shift: true }],
  },
  {
    id: "editor-link",
    label: "Insert link",
    group: "Editor",
    editorOwned: true,
    combos: [{ key: "k", mod: true, shift: true }],
  },
  {
    id: "editor-list-numbered",
    label: "Numbered list",
    group: "Editor",
    editorOwned: true,
    combos: [{ key: "7", mod: true, shift: true }],
  },
  {
    id: "editor-list-bullet",
    label: "Bullet list",
    group: "Editor",
    editorOwned: true,
    combos: [{ key: "8", mod: true, shift: true }],
  },
  {
    id: "editor-quote",
    label: "Quote",
    group: "Editor",
    editorOwned: true,
    combos: [{ key: "9", mod: true, shift: true }],
  },
  {
    id: "editor-paragraph",
    label: "Paragraph",
    group: "Editor",
    editorOwned: true,
    combos: [{ key: "0", mod: true, alt: true }],
  },
  {
    id: "editor-h1",
    label: "Heading 1",
    group: "Editor",
    editorOwned: true,
    combos: [{ key: "1", mod: true, alt: true }],
  },
  {
    id: "editor-h2",
    label: "Heading 2",
    group: "Editor",
    editorOwned: true,
    combos: [{ key: "2", mod: true, alt: true }],
  },
  {
    id: "editor-h3",
    label: "Heading 3",
    group: "Editor",
    editorOwned: true,
    combos: [{ key: "3", mod: true, alt: true }],
  },
  {
    id: "editor-undo",
    label: "Undo",
    group: "Editor",
    editorOwned: true,
    combos: [{ key: "z", mod: true }],
  },
  {
    id: "editor-redo",
    label: "Redo",
    group: "Editor",
    editorOwned: true,
    combos: [
      { key: "y", mod: true },
      { key: "z", mod: true, shift: true },
    ],
  },
];
