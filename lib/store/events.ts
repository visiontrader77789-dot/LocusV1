"use client";

/**
 * Tiny module-level event bus. Used to open the command palette from anywhere
 * (topbar button, keyboard shortcut, "/" in the editor) without prop-drilling,
 * and for one-off UI nudges (sidebar toggle, page rename) that are initiated
 * outside the component that owns the state.
 */

const PALETTE_OPEN = "locus:palette-open";
const PALETTE_CLOSE = "locus:palette-close";

export type PaletteMode = "search" | "task" | "page";

export function openPalette(mode: PaletteMode = "search"): void {
  window.dispatchEvent(new CustomEvent(PALETTE_OPEN, { detail: { mode } }));
}

export function closePalette(): void {
  window.dispatchEvent(new CustomEvent(PALETTE_CLOSE));
}

export function onPaletteOpen(fn: (mode: PaletteMode) => void): () => void {
  const handler = (e: Event) => fn(((e as CustomEvent).detail?.mode ?? "search") as PaletteMode);
  window.addEventListener(PALETTE_OPEN, handler);
  return () => window.removeEventListener(PALETTE_OPEN, handler);
}

export function onPaletteClose(fn: () => void): () => void {
  const handler = () => fn();
  window.addEventListener(PALETTE_CLOSE, handler);
  return () => window.removeEventListener(PALETTE_CLOSE, handler);
}

const SIDEBAR_OPEN = "locus:sidebar-open";

export function openMobileSidebar(): void {
  window.dispatchEvent(new CustomEvent(SIDEBAR_OPEN));
}

export function onSidebarOpen(fn: () => void): () => void {
  const handler = () => fn();
  window.addEventListener(SIDEBAR_OPEN, handler);
  return () => window.removeEventListener(SIDEBAR_OPEN, handler);
}

const SIDEBAR_TOGGLE = "locus:sidebar-toggle";

export function toggleSidebar(): void {
  window.dispatchEvent(new CustomEvent(SIDEBAR_TOGGLE));
}

export function onSidebarToggle(fn: () => void): () => void {
  const handler = () => fn();
  window.addEventListener(SIDEBAR_TOGGLE, handler);
  return () => window.removeEventListener(SIDEBAR_TOGGLE, handler);
}

const PAGE_RENAME = "locus:page-rename";

export function requestPageRename(): void {
  window.dispatchEvent(new CustomEvent(PAGE_RENAME));
}

export function onRequestPageRename(fn: () => void): () => void {
  const handler = () => fn();
  window.addEventListener(PAGE_RENAME, handler);
  return () => window.removeEventListener(PAGE_RENAME, handler);
}
