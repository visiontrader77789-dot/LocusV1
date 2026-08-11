/**
 * Shared types for the keyboard shortcut system.
 */

export type ShortcutGroup =
  | "General"
  | "Create"
  | "Navigate"
  | "Page"
  | "Sidebar"
  | "Editor";

/**
 * One key combination. Modifiers are optional; an omitted modifier must be
 * released for the combo to match (strict matching).
 *
 * `mod` is the platform primary modifier: Ctrl on Windows/Linux, Cmd on macOS.
 * Use `ctrl`/`meta` only for combos that literally require a specific key.
 */
export interface ShortcutCombo {
  /** `e.key`, lowercase for letters (e.g. "k", "f2", "escape", "/", ","). */
  key: string;
  mod?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export interface ShortcutDef {
  /** Stable id used by the registry, overrides and actions. */
  id: string;
  /** Human readable name, e.g. "Search everything". */
  label: string;
  group: ShortcutGroup;
  /** Primary combo first; alternates follow. */
  combos: ShortcutCombo[];
  /** Run while an editable element (input/textarea/contentEditable) is focused. */
  whenEditable?: boolean;
  /** Only meaningful while this route is active. */
  route?: "page";
  /** The editor implements this itself; listed in help for documentation only. */
  editorOwned?: boolean;
  /** Shown under the label in the settings list. */
  description?: string;
  /** Requires a confirmation dialog before running. */
  destructive?: boolean;
}
