"use client";

import type { ComponentType, ReactNode } from "react";
import type { WidgetSize, WidgetType } from "@/lib/core/widgets";
import { ALL_WIDGET_TYPES } from "@/lib/core/widgets";
import { WidgetTypeIcon, type WidgetProps } from "./instances";
import {
  CalendarWidget, ClockWidget, CountdownWidget, FavoritesWidget, PomodoroWidget,
  QuickActionsWidget, QuickNoteWidget, QuoteWidget, RecentPagesWidget,
  StatsWidget, StickyNoteWidget, TodayTasksWidget,
} from "./instances";

export interface WidgetDef {
  type: WidgetType;
  name: string;
  description: string;
  category: string;
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
  icon: ReactNode;
  component: ComponentType<WidgetProps>;
}

export const WIDGET_CATEGORIES = ["Time", "Notes", "Tasks", "Tools"] as const;

const CATEGORY: Record<WidgetType, string> = {
  clock: "Time",
  calendar: "Time",
  pomodoro: "Time",
  countdown: "Time",
  "quick-note": "Notes",
  "sticky-note": "Notes",
  quote: "Notes",
  "todays-tasks": "Tasks",
  favorites: "Tasks",
  "recent-pages": "Tasks",
  "quick-actions": "Tools",
  stats: "Tools",
};

const COMPONENTS: Record<WidgetType, ComponentType<WidgetProps>> = {
  clock: ClockWidget,
  calendar: CalendarWidget,
  pomodoro: PomodoroWidget,
  "quick-note": QuickNoteWidget,
  "todays-tasks": TodayTasksWidget,
  favorites: FavoritesWidget,
  "recent-pages": RecentPagesWidget,
  countdown: CountdownWidget,
  "sticky-note": StickyNoteWidget,
  quote: QuoteWidget,
  "quick-actions": QuickActionsWidget,
  stats: StatsWidget,
};

const NAMES: Record<WidgetType, string> = {
  clock: "Clock",
  calendar: "Calendar",
  pomodoro: "Pomodoro",
  "quick-note": "Quick note",
  "todays-tasks": "Today's tasks",
  favorites: "Favorites",
  "recent-pages": "Recent pages",
  countdown: "Countdown",
  "sticky-note": "Sticky note",
  quote: "Focus quote",
  "quick-actions": "Quick actions",
  stats: "Productivity stats",
};

const DESCRIPTIONS: Record<WidgetType, string> = {
  clock: "Keep the current time on your dashboard.",
  calendar: "This month at a glance with today highlighted.",
  pomodoro: "A 25-minute focus timer with start and reset.",
  "quick-note": "A scratchpad that saves as you type.",
  "todays-tasks": "Tasks due today and your open count.",
  favorites: "Starred pages, tasks and files.",
  "recent-pages": "The pages you've edited most recently.",
  countdown: "Days until a target date you set.",
  "sticky-note": "A color-coded note for quick reminders.",
  quote: "A focus quote to keep you going.",
  "quick-actions": "New page, task, search and upload in one place.",
  stats: "Pages, open tasks, due today and files.",
};

const SIZES: Record<WidgetType, WidgetSize[]> = {
  clock: ["small", "medium"],
  calendar: ["medium"],
  pomodoro: ["small", "medium"],
  "quick-note": ["medium"],
  "todays-tasks": ["medium"],
  favorites: ["medium"],
  "recent-pages": ["medium"],
  countdown: ["small", "medium"],
  "sticky-note": ["small"],
  quote: ["small", "medium"],
  "quick-actions": ["small"],
  stats: ["medium"],
};

export const WIDGET_CATALOG: WidgetDef[] = ALL_WIDGET_TYPES.map((type) => ({
  type,
  name: NAMES[type],
  description: DESCRIPTIONS[type],
  category: CATEGORY[type],
  sizes: SIZES[type],
  defaultSize: SIZES[type][0],
  icon: <WidgetTypeIcon type={type} />,
  component: COMPONENTS[type],
}));

const CATALOG_BY_TYPE = new Map(WIDGET_CATALOG.map((def) => [def.type, def]));

export function widgetDef(type: WidgetType): WidgetDef {
  const def = CATALOG_BY_TYPE.get(type);
  if (!def) throw new Error(`Unknown widget type: ${type}`);
  return def;
}
