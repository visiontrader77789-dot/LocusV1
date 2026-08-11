"use client";

/**
 * Tiny module-level event bus. Used to open the command palette from anywhere
 * (topbar button, keyboard shortcut, "/" in the editor) without prop-drilling.
 */

const PALETTE_OPEN = "locus:palette-open";
const PALETTE_CLOSE = "locus:palette-close";

export function openPalette(): void {
  window.dispatchEvent(new CustomEvent(PALETTE_OPEN));
}

export function closePalette(): void {
  window.dispatchEvent(new CustomEvent(PALETTE_CLOSE));
}

export function onPaletteOpen(fn: () => void): () => void {
  const handler = () => fn();
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
