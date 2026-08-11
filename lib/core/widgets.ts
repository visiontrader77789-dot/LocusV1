/**
 * Locus widget data model.
 *
 * Platform-independent (no DOM / browser APIs): types plus a normalizer used
 * when reading widget layout back from localStorage.
 */

export type WidgetType =
  | "clock"
  | "calendar"
  | "pomodoro"
  | "quick-note"
  | "todays-tasks"
  | "favorites"
  | "recent-pages"
  | "countdown"
  | "sticky-note"
  | "quote"
  | "quick-actions"
  | "stats";

export type WidgetSize = "small" | "medium";

/** A placed widget on the dashboard. */
export interface WidgetInstance {
  /** Instance id (unique within a workspace). */
  id: string;
  type: WidgetType;
  size: WidgetSize;
  /** Per-instance settings (note text, countdown target, sticky color, …). */
  data: Record<string, string>;
}

export const ALL_WIDGET_TYPES: readonly WidgetType[] = [
  "clock",
  "calendar",
  "pomodoro",
  "quick-note",
  "todays-tasks",
  "favorites",
  "recent-pages",
  "countdown",
  "sticky-note",
  "quote",
  "quick-actions",
  "stats",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validate an unknown value as a list of widget instances. Used when reading
 * the persisted layout so a corrupt localStorage entry can never break the
 * dashboard. Malformed entries are dropped.
 */
export function normalizeWidgetInstances(raw: unknown): WidgetInstance[] {
  if (!Array.isArray(raw)) return [];
  const out: WidgetInstance[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if (typeof item.type !== "string" || !ALL_WIDGET_TYPES.includes(item.type as WidgetType)) continue;
    const id = typeof item.id === "string" && item.id.length > 0 && item.id.length <= 128 ? item.id : `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const data: Record<string, string> = {};
    if (isRecord(item.data)) {
      for (const [k, v] of Object.entries(item.data)) {
        if (typeof v === "string" && k.length > 0 && k.length <= 64 && v.length <= 200_000) {
          data[k] = v;
        }
      }
    }
    out.push({
      id,
      type: item.type as WidgetType,
      size: item.size === "medium" ? "medium" : "small",
      data,
    });
  }
  return out;
}
