/** Utility helpers shared by core logic. Platform-independent. */

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function now(): number {
  return Date.now();
}

/** ISO date (YYYY-MM-DD) for a given time, in local time. */
export function isoDate(ts = Date.now()): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isToday(iso: string): boolean {
  return iso === isoDate();
}

export function isOverdue(iso: string): boolean {
  return iso < isoDate();
}

export function isUpcoming(iso: string): boolean {
  return iso > isoDate();
}

/** Compare ISO dates (null sorts last). */
export function compareDates(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

export function humanDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Normalize text for search: lowercase, strip accents, collapse whitespace. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Basic tokenization into alphanumeric tokens. */
export function tokenize(s: string): string[] {
  return normalize(s).match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Validate a link target typed into the link dialog.
 * Bare text (a page title) and http(s)/mailto/ftp URLs are allowed;
 * any other scheme (e.g. javascript:, data:) is rejected for safety.
 * Empty string is allowed (means "remove the link").
 */
export function isValidLinkTarget(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v)) {
    return /^(https?|mailto|ftp):/i.test(v);
  }
  return true;
}
