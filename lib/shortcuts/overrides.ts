/**
 * User customization for shortcuts, stored in localStorage.
 *
 * The app ships with built-ins only; this module provides the persistence
 * layer so user remapping can be added later without rearchitecting. Every
 * consumer of the shortcut table should go through `effectiveShortcuts()`,
 * which merges any saved overrides over the built-ins.
 */
import { BUILTIN_SHORTCUTS } from "./defaults";
import type { ShortcutCombo, ShortcutDef } from "./types";

const STORAGE_KEY = "locus:shortcuts";

type Overrides = Record<string, ShortcutCombo[]>;

function readOverrides(): Overrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Overrides;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeOverrides(value: Overrides): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota/serialization errors
  }
}

/** Replace the combos for one shortcut. */
export function setShortcutOverride(id: string, combos: ShortcutCombo[]): void {
  const next = readOverrides();
  if (combos.length === 0) delete next[id];
  else next[id] = combos;
  writeOverrides(next);
}

/** Restore the built-in combos for one shortcut. */
export function clearShortcutOverride(id: string): void {
  const next = readOverrides();
  delete next[id];
  writeOverrides(next);
}

export function clearAllShortcutOverrides(): void {
  writeOverrides({});
}

/** Whether any overrides are saved (useful for a future "Reset" button). */
export function hasShortcutOverrides(): boolean {
  return Object.keys(readOverrides()).length > 0;
}

/** Built-ins with any saved overrides applied. */
export function effectiveShortcuts(): ShortcutDef[] {
  const overrides = readOverrides();
  return BUILTIN_SHORTCUTS.map((def) => {
    const comboOverride = overrides[def.id];
    if (!comboOverride) return def;
    return { ...def, combos: comboOverride };
  });
}
