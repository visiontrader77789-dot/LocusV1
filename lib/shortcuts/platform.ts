/**
 * Platform detection and human-readable formatting for key combos.
 * All functions are safe to call during SSR (they fall back to defaults).
 */

export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const p = navigator.platform ?? "";
  return /Mac|iP(hone|ad|od)/.test(p) || (navigator.userAgent ?? "").includes("Macintosh");
}

export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

/** Label for the platform primary modifier. */
export function modLabel(): string {
  return isMac() ? "⌘" : "Ctrl";
}

const KEY_LABELS: Record<string, string> = {
  " ": "Space",
  escape: "Esc",
  enter: "Enter",
  delete: "Del",
  backspace: "Backspace",
  tab: "Tab",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  ",": ",",
  "/": "/",
  "\\": "\\",
  "`": "`",
};

function keyLabel(key: string): string {
  const k = key.toLowerCase();
  if (KEY_LABELS[k]) return KEY_LABELS[k];
  if (k.startsWith("f") && /^f\d{1,2}$/.test(k)) return k.toUpperCase();
  if (k.length === 1) return k.toUpperCase();
  return key;
}

/** Format a single combo, e.g. "Ctrl+Shift+N" or "⌘⇧N". */
export function formatShortcut(combo: { key: string; mod?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean }): string {
  const mac = isMac();
  const parts: string[] = [];
  if (combo.mod) parts.push(mac ? "⌘" : "Ctrl");
  if (combo.ctrl) parts.push(mac ? "Ctrl" : "Ctrl");
  if (combo.alt) parts.push(mac ? "⌥" : "Alt");
  if (combo.shift) parts.push(mac ? "⇧" : "Shift");
  parts.push(keyLabel(combo.key));
  return parts.join(mac ? "" : "+");
}

/** Alias kept for the settings list. */
export const formatCombo = formatShortcut;

/** "Control+K Meta+K", the format expected by `aria-keyshortcuts`. */
export function ariaKeyshortcuts(combos: Array<{ key: string; mod?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean }>): string {
  return combos
    .map((c) => {
      const parts: string[] = [];
      if (c.mod) parts.push("Control", "Meta");
      if (c.ctrl) parts.push("Control");
      if (c.alt) parts.push("Alt");
      if (c.shift) parts.push("Shift");
      parts.push(keyLabel(c.key).replace(/[⇧⌘⌥↑↓←→]/g, ""));
      return parts.join("+");
    })
    .join(" ");
}
