/**
 * Registry: indexed lookup over the (possibly overridden) shortcut table plus
 * duplicate/conflict detection. Also hosts the "jump to shortcut help" focus
 * flag used by the settings screen.
 */
import type { ShortcutCombo, ShortcutDef } from "./types";

const FOCUS_FLAG = "locus:focus-shortcuts";

/** Normalized key for a combo, identical on both platforms. */
export function comboKey(c: ShortcutCombo): string {
  const parts: string[] = [c.key.toLowerCase()];
  if (c.mod) parts.push("mod");
  if (c.ctrl) parts.push("ctrl");
  if (c.alt) parts.push("alt");
  if (c.shift) parts.push("shift");
  return parts.sort().join("+");
}

/**
 * Detect identical combos registered by more than one shortcut. Returns a list
 * of human-readable warnings; empty when everything is clean.
 */
export function validateShortcuts(defs: ShortcutDef[]): string[] {
  const seen = new Map<string, ShortcutDef>();
  const warnings: string[] = [];
  for (const def of defs) {
    for (const combo of def.combos) {
      const key = comboKey(combo);
      const other = seen.get(key);
      if (other && other.id !== def.id) {
        warnings.push(
          `Shortcut conflict: "${other.label}" and "${def.label}" both use ${key}.`,
        );
      } else if (!other) {
        seen.set(key, def);
      }
    }
  }
  return warnings;
}

/**
 * Ask the settings screen to scroll the shortcut list into view and focus its
 * search box. Called before navigating to settings; the panel consumes the flag.
 */
export function requestShortcutsHelpFocus(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FOCUS_FLAG, "1");
  } catch {
    // ignore
  }
}

/** Consume the focus flag; returns true if the panel should auto-focus. */
export function consumeShortcutsHelpFocus(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const hit = window.sessionStorage.getItem(FOCUS_FLAG) === "1";
    window.sessionStorage.removeItem(FOCUS_FLAG);
    return hit;
  } catch {
    return false;
  }
}
