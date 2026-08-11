"use client";

import type { WidgetInstance } from "@/lib/core/widgets";
import { normalizeWidgetInstances } from "@/lib/core/widgets";

const KEY_PREFIX = "locus:widgets:";

export function widgetStorageKey(workspaceId: string): string {
  return `${KEY_PREFIX}${workspaceId}`;
}

export function loadWidgets(workspaceId: string): WidgetInstance[] {
  try {
    const raw = window.localStorage.getItem(widgetStorageKey(workspaceId));
    if (!raw) return [];
    return normalizeWidgetInstances(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveWidgets(workspaceId: string, instances: WidgetInstance[]): void {
  try {
    window.localStorage.setItem(widgetStorageKey(workspaceId), JSON.stringify(instances));
  } catch {
    // storage full / unavailable — the in-memory layout still works for this tab
  }
}
