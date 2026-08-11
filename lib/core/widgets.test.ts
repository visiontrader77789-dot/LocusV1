import { describe, expect, it } from "vitest";
import { ALL_WIDGET_TYPES, normalizeWidgetInstances } from "./widgets";

describe("widget instances", () => {
  it("exposes the full 12-widget catalogue", () => {
    expect(ALL_WIDGET_TYPES).toHaveLength(12);
    expect(ALL_WIDGET_TYPES).toContain("clock");
    expect(ALL_WIDGET_TYPES).toContain("calendar");
    expect(ALL_WIDGET_TYPES).toContain("pomodoro");
    expect(ALL_WIDGET_TYPES).toContain("quick-note");
    expect(ALL_WIDGET_TYPES).toContain("todays-tasks");
    expect(ALL_WIDGET_TYPES).toContain("favorites");
    expect(ALL_WIDGET_TYPES).toContain("recent-pages");
    expect(ALL_WIDGET_TYPES).toContain("countdown");
    expect(ALL_WIDGET_TYPES).toContain("sticky-note");
    expect(ALL_WIDGET_TYPES).toContain("quote");
    expect(ALL_WIDGET_TYPES).toContain("quick-actions");
    expect(ALL_WIDGET_TYPES).toContain("stats");
  });

  it("returns an empty list for invalid input", () => {
    expect(normalizeWidgetInstances(null)).toEqual([]);
    expect(normalizeWidgetInstances("nope")).toEqual([]);
    expect(normalizeWidgetInstances({ a: 1 })).toEqual([]);
  });

  it("drops unknown types and keeps valid ones", () => {
    const out = normalizeWidgetInstances([
      { id: "a", type: "clock", size: "small", data: {} },
      { id: "b", type: "weather", size: "medium", data: {} },
      { id: "c", type: "pomodoro", size: "medium" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "a", type: "clock", size: "small" });
    expect(out[1]).toMatchObject({ id: "c", type: "pomodoro", size: "medium" });
  });

  it("defaults missing sizes to small and data to empty", () => {
    const out = normalizeWidgetInstances([{ type: "quote" }]);
    expect(out).toHaveLength(1);
    expect(out[0].size).toBe("small");
    expect(out[0].data).toEqual({});
    expect(out[0].id.length).toBeGreaterThan(0);
  });

  it("dedupes duplicate ids and ignores non-string data values", () => {
    const out = normalizeWidgetInstances([
      { id: "x", type: "clock", data: { note: "hi", n: 42 } },
      { id: "x", type: "calendar", data: {} },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].data).toEqual({ note: "hi" });
  });

  it("sanitizes oversized data values", () => {
    const out = normalizeWidgetInstances([
      { id: "y", type: "sticky-note", data: { text: "a".repeat(300_000) } },
    ]);
    expect(out[0].data).toEqual({});
  });
});
