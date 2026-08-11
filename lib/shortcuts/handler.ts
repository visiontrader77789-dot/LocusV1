/**
 * The single global keydown listener behind every shortcut.
 *
 * Gating rules, applied in order:
 * 1. IME composition is always ignored.
 * 2. Key repeats are ignored unless the shortcut opts in.
 * 3. While any overlay (dialog/menu) is open, only `Escape` shortcuts run.
 * 4. Editable elements (input/textarea/contentEditable) swallow global
 *    shortcuts unless the shortcut sets `whenEditable`.
 *
 * Every matched combo calls `preventDefault()` so browser defaults (save
 * dialog, print, tab switching, …) never leak through inside the app.
 */
import { isMac } from "./platform";
import type { ShortcutCombo, ShortcutDef } from "./types";

export interface ShortcutAction {
  def: ShortcutDef;
  run: () => void;
}

/** Is the keydown target an editable surface? */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : target instanceof Node ? (target as Node).parentElement : null;
  if (!el) return false;
  const closest = el.closest<HTMLElement>(
    'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
  );
  return closest !== null;
}

/** Is a dialog/menu overlay currently open in the DOM? */
export function hasOpenOverlay(): boolean {
  return (
    typeof document !== "undefined" &&
    document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null
  );
}

export function isModDown(e: KeyboardEvent): boolean {
  return isMac() ? e.metaKey : e.ctrlKey;
}

export function matchesCombo(e: KeyboardEvent, combo: ShortcutCombo): boolean {
  const mac = isMac();
  if (e.key.toLowerCase() !== combo.key.toLowerCase()) return false;

  const wantCtrl = combo.ctrl === true || (!mac && combo.mod === true);
  const wantMeta = mac && combo.mod === true;
  const wantAlt = combo.alt === true;
  const wantShift = combo.shift === true;

  return e.ctrlKey === wantCtrl && e.metaKey === wantMeta && e.altKey === wantAlt && e.shiftKey === wantShift;
}

export function attachShortcutHandler(actions: ShortcutAction[]): () => void {
  if (typeof window === "undefined") return () => {};

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229) return;
    const editable = isEditableTarget(e.target);
    const overlayOpen = hasOpenOverlay();

    for (const { def, run } of actions) {
      if (e.repeat) continue;
      const combo = def.combos.find((c) => matchesCombo(e, c));
      if (!combo) continue;

      const isEscape = combo.key.toLowerCase() === "escape";
      if (overlayOpen && !isEscape) continue;
      if (editable && !def.whenEditable) continue;

      e.preventDefault();
      run();
      return;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
