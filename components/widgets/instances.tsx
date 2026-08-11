"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { WidgetInstance } from "@/lib/core/widgets";
import { isoDate, relativeTime } from "@/lib/core/util";
import { useApp } from "@/lib/store/app";
import { navigate } from "@/lib/store/router";
import { openPalette } from "@/lib/store/events";
import {
  IconCalendar, IconChart, IconClock, IconHourglass, IconNoteSticky, IconPage,
  IconPen, IconPlay, IconPlus, IconQuote, IconSearch, IconStar, IconTasks, IconUpload, IconX,
} from "@/components/icons";

export interface WidgetProps {
  instance: WidgetInstance;
  setData: (patch: Record<string, string>) => void;
}

function WidgetHeader({ title, icon, right }: { title: string; icon?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h3 className="eyebrow flex items-center gap-1.5">
        {icon && <span className="inline-flex leading-none text-ink-3">{icon}</span>}
        <span>{title}</span>
      </h3>
      {right}
    </div>
  );
}

// ---- clock -----------------------------------------------------------------
export function ClockWidget({ instance }: WidgetProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const medium = instance.size === "medium";
  const h12 = now.getHours() % 12 || 12;
  const hh = String(h12).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ampm = now.getHours() >= 12 ? "PM" : "AM";
  const date = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return "";
    }
  }, []);

  return (
    <div>
      <WidgetHeader title="Clock" icon={<IconClock size={12} />} />
      <div className="relative">
        <span className="clock-dial" aria-hidden="true" />
        <span className="clock-glow" aria-hidden="true" />
        <span className="clock-sheen" aria-hidden="true" />
        <div className="relative">
          <div
            key={`${hh}:${mm}`}
            className={`clock-time-row ${medium ? "text-[40px] sm:text-[46px]" : "text-[30px] sm:text-[33px]"}`}
          >
            <span className="clock-hh">{hh}</span>
            <span className="clock-colon">:</span>
            <span className="clock-mm">{mm}</span>
            {medium && (
              <span key={ss} className="clock-sec">{ss}</span>
            )}
            <span className="clock-ampm">{ampm}</span>
          </div>
          <div className="clock-rule" aria-hidden="true" />
          <p className="clock-date">{date}</p>
          {medium && tz && <p className="clock-tz">{tz}</p>}
        </div>
      </div>
    </div>
  );
}

// ---- calendar --------------------------------------------------------------
export function CalendarWidget(_props: WidgetProps) {
  const { monthName, cells, today } = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const first = new Date(now.getFullYear(), m, 1);
    const start = first.getDay();
    const days = new Date(now.getFullYear(), m + 1, 0).getDate();
    const list: Array<number | null> = [
      ...Array.from({ length: start }, () => null),
      ...Array.from({ length: days }, (_, i) => i + 1),
    ];
    while (list.length % 7 !== 0) list.push(null);
    return {
      monthName: first.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      cells: list,
      today: now.getDate(),
    };
  }, []);
  const weekday = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  return (
    <div>
      <WidgetHeader title={monthName} icon={<IconCalendar size={12} />} />
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {weekday.map((d) => (
          <span key={d} className="font-mono text-[9.5px] text-ink-3 pb-1">{d}</span>
        ))}
        {cells.map((d, i) => (
          <span key={i} className="flex items-center justify-center h-7">
            {d !== null && (
              <span
                className={`w-6 h-6 flex items-center justify-center rounded-full text-[12.5px] ${
                  d === today
                    ? "bg-accent text-accent-ink font-semibold"
                    : "text-ink hover:bg-surface-2"
                }`}
              >
                {d}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- pomodoro --------------------------------------------------------------
const FOCUS_MIN = 25;

export function PomodoroWidget({ instance }: WidgetProps) {
  const total = FOCUS_MIN * 60;
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) { setRunning(false); return total; }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [running, total]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const size = instance.size === "medium" ? "text-[42px]" : "text-[32px]";
  return (
    <div>
      <WidgetHeader title="Pomodoro" icon={<IconHourglass size={12} />} />
      <div className="flex items-baseline gap-2">
        <span className={`font-display font-semibold tracking-tight tabular-nums ${size}`}>
          {mm}:{ss}
        </span>
        <span className="text-[11px] text-ink-3">focus</span>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <button
          type="button"
          className="h-7 px-3 rounded-[8px] text-[12px] font-medium bg-accent text-accent-ink hover:bg-accent-hi transition-colors"
          onClick={() => setRunning((r) => !r)}
        >
          {running ? "Pause" : "Start"}
        </button>
        <button
          type="button"
          className="h-7 px-3 rounded-[8px] text-[12px] font-medium border border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
          onClick={() => { setRunning(false); setLeft(total); }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// ---- quick note ------------------------------------------------------------
export function QuickNoteWidget({ instance, setData }: WidgetProps) {
  const text = instance.data.text ?? "";
  return (
    <div>
      <WidgetHeader title="Quick note" icon={<IconPen size={12} />} />
      <textarea
        aria-label="Quick note"
        value={text}
        placeholder="Jot something down…"
        onChange={(e) => setData({ text: e.target.value })}
        rows={5}
        className="w-full bg-transparent text-[13.5px] leading-relaxed text-ink placeholder:text-ink-3 outline-none resize-none"
      />
      <p className="mt-1 text-[11px] text-ink-3">Saved on this device as you type.</p>
    </div>
  );
}

// ---- today's tasks ---------------------------------------------------------
export function TodayTasksWidget(_props: WidgetProps) {
  const { tasks } = useApp();
  const today = isoDate();
  const open = tasks.filter((t) => !t.completed);
  const dueToday = open.filter((t) => t.dueDate === today).slice(0, 5);
  const totalOpen = open.length;
  return (
    <div>
      <WidgetHeader
        title="Today's tasks"
        icon={<IconTasks size={12} />}
        right={
          <button type="button" className="text-[12px] text-ink-2 hover:text-ink" onClick={() => navigate({ name: "tasks" })}>
            View all
          </button>
        }
      />
      {dueToday.length === 0 ? (
        <p className="text-[13px] text-ink-2">
          {totalOpen === 0 ? "Nothing pending." : `${totalOpen} open task${totalOpen > 1 ? "s" : ""} — none due today.`}
        </p>
      ) : (
        <ul className="space-y-1">
          {dueToday.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-[13px]">
              <span className="w-3.5 h-3.5 shrink-0 rounded-[4px] border border-line-strong" />
              <span className="flex-1 min-w-0 truncate">{t.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- favorites -------------------------------------------------------------
export function FavoritesWidget(_props: WidgetProps) {
  const { favorites } = useApp();
  const pages = favorites.pages.slice(0, 4);
  const total = favorites.pages.length + favorites.tasks.length + favorites.files.length;
  return (
    <div>
      <WidgetHeader
        title="Favorites"
        icon={<IconStar size={12} />}
        right={
          <button type="button" className="text-[12px] text-ink-2 hover:text-ink" onClick={() => navigate({ name: "favorites" })}>
            View all
          </button>
        }
      />
      {total === 0 ? (
        <p className="text-[13px] text-ink-2">Star pages, tasks and files to pin them here.</p>
      ) : (
        <ul className="space-y-1">
          {pages.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => navigate({ name: "page", id: p.id })}
                className="w-full flex items-center gap-2.5 px-1 py-1 rounded-[5px] text-left hover:bg-surface-2 transition-colors"
              >
                <span className="w-5 h-5 shrink-0 flex items-center justify-center text-[14px]">
                  {p.icon ? <span>{p.icon}</span> : <IconPage size={13} className="text-ink-3" />}
                </span>
                <span className="flex-1 min-w-0 text-[13px] truncate">{p.title}</span>
                <IconStar size={12} className="text-warn shrink-0" />
              </button>
            </li>
          ))}
          {(favorites.tasks.length > 0 || favorites.files.length > 0) && (
            <li className="px-1 pt-1 text-[11.5px] text-ink-3">
              + {favorites.tasks.length} task{favorites.tasks.length !== 1 ? "s" : ""}
              {favorites.files.length > 0 && ` · ${favorites.files.length} file${favorites.files.length !== 1 ? "s" : ""}`}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ---- recent pages ----------------------------------------------------------
export function RecentPagesWidget(_props: WidgetProps) {
  const { recentPages } = useApp();
  const pages = recentPages.slice(0, 4);
  return (
    <div>
      <WidgetHeader title="Recent pages" icon={<IconPage size={12} />} />
      {pages.length === 0 ? (
        <p className="text-[13px] text-ink-2">Your recently edited pages show up here.</p>
      ) : (
        <ul className="space-y-1">
          {pages.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => navigate({ name: "page", id: p.id })}
                className="w-full flex items-center gap-2.5 px-1 py-1 rounded-[5px] text-left hover:bg-surface-2 transition-colors"
              >
                <span className="w-5 h-5 shrink-0 flex items-center justify-center text-[14px]">
                  {p.icon ? <span>{p.icon}</span> : <IconPage size={13} className="text-ink-3" />}
                </span>
                <span className="flex-1 min-w-0 text-[13px] truncate">{p.title}</span>
                <span className="font-mono text-[10.5px] text-ink-3 shrink-0">{relativeTime(p.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- countdown -------------------------------------------------------------
export function CountdownWidget({ instance, setData }: WidgetProps) {
  const [editing, setEditing] = useState(false);
  const target = instance.data.target ?? "";
  const label = instance.data.label ?? "big day";
  const days = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return null;
    const diff = new Date(`${target}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0);
    return Math.ceil(diff / 86_400_000);
  }, [target]);
  return (
    <div>
      <WidgetHeader
        title="Countdown"
        right={
          <button
            type="button"
            className="icon-btn tooltip"
            aria-label="Set countdown date"
            title="Set countdown date"
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? <IconX size={14} /> : <IconHourglass size={14} />}
          </button>
        }
      />
      {editing || !target ? (
        <div className="space-y-2">
          <input
            type="date"
            aria-label="Target date"
            value={target}
            onChange={(e) => { setData({ target: e.target.value }); if (e.target.value) setEditing(false); }}
            className="text-input !h-8 !text-[12.5px]"
          />
          <input
            type="text"
            aria-label="Countdown label"
            placeholder="Label (e.g. product launch)"
            value={label}
            maxLength={40}
            onChange={(e) => setData({ label: e.target.value })}
            className="text-input !h-8 !text-[12.5px]"
          />
        </div>
      ) : (
        <div>
          <div className="font-display font-semibold tracking-tight text-[30px] leading-none tabular-nums">
            {days === null ? "—" : days > 0 ? `${days} day${days === 1 ? "" : "s"}` : days === 0 ? "Today" : "Passed"}
          </div>
          <p className="mt-1.5 text-[12.5px] text-ink-2 truncate">{label}</p>
          {days !== null && days > 0 && (
            <p className="font-mono text-[10.5px] text-ink-3 mt-0.5">{target}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---- sticky note -----------------------------------------------------------
const STICKY_COLORS: Record<string, string> = {
  yellow: "#f9e7a6",
  mint: "#cdeeda",
  pink: "#f7d0d4",
  blue: "#cdddf2",
  lavender: "#e2d6f2",
};

export function StickyNoteWidget({ instance, setData }: WidgetProps) {
  const color = STICKY_COLORS[instance.data.color ?? ""] ?? STICKY_COLORS.yellow;
  const text = instance.data.text ?? "";
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="eyebrow flex items-center gap-1.5 text-ink-2">
          <span className="inline-flex leading-none text-ink-3"><IconNoteSticky size={12} /></span>
          <span>Sticky note</span>
        </h3>
        <div className="flex items-center gap-1">
          {Object.entries(STICKY_COLORS).map(([name, hex]) => (
            <button
              key={name}
              type="button"
              aria-label={`${name} sticky note`}
              className={`w-3.5 h-3.5 rounded-full border border-black/15 transition-transform ${instance.data.color === name ? "ring-2 ring-ink/60" : "hover:scale-110"}`}
              style={{ background: hex }}
              onClick={() => setData({ color: name })}
            />
          ))}
        </div>
      </div>
      <textarea
        aria-label="Sticky note"
        value={text}
        placeholder="Write a note…"
        onChange={(e) => setData({ text: e.target.value })}
        rows={4}
        className="w-full rounded-[6px] px-3 py-2 text-[13.5px] leading-relaxed text-ink placeholder:text-ink-2/60 outline-none resize-none"
        style={{ background: color }}
      />
    </div>
  );
}

// ---- quote -----------------------------------------------------------------
const QUOTES: Array<{ text: string; author: string }> = [
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Small daily improvements are the key to staggering long-term results.", author: "Unknown" },
  { text: "Do the hard jobs first. The easy jobs will take care of themselves.", author: "Dale Carnegie" },
  { text: "You do not rise to the level of your goals. You fall to the level of your systems.", author: "James Clear" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "Amateurs sit and wait for inspiration. The rest of us just get up and go to work.", author: "Stephen King" },
  { text: "Your focus is your reality.", author: "Unknown" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
];

export function QuoteWidget({ instance, setData }: WidgetProps) {
  const [idx, setIdx] = useState(() => {
    const start = Number(instance.data.idx ?? "");
    return Number.isInteger(start) && start >= 0 ? start % QUOTES.length : new Date().getDay() % QUOTES.length;
  });
  const quote = QUOTES[idx];
  const next = () => {
    const n = (idx + 1) % QUOTES.length;
    setIdx(n);
    setData({ idx: String(n) });
  };
  return (
    <div>
      <WidgetHeader
        title="Focus"
        right={
          <button type="button" className="icon-btn tooltip" aria-label="Show another quote" title="Another" onClick={next}>
            <IconClock size={13} />
          </button>
        }
      />
      <blockquote className="text-[14px] leading-relaxed text-ink">“{quote.text}”</blockquote>
      <footer className="mt-2 text-[11.5px] text-ink-3">{quote.author}</footer>
    </div>
  );
}

// ---- quick actions ---------------------------------------------------------
export function QuickActionsWidget(_props: WidgetProps) {
  const { createPage, createTask, addFiles, pushNotice } = useApp();
  const actions = [
    { label: "New page", icon: <IconPage size={14} />, run: () => void createPage(null).then((p) => navigate({ name: "page", id: p.id })) },
    { label: "New task", icon: <IconTasks size={14} />, run: () => {
      const title = window.prompt("Task title");
      if (title?.trim()) void createTask(title.trim()).then(() => pushNotice("success", "Task added"));
    } },
    { label: "Search", icon: <IconSearch size={14} />, run: () => openPalette() },
    { label: "Upload", icon: <IconUpload size={14} />, run: () => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.onchange = () => {
        const fs = Array.from(input.files ?? []);
        if (fs.length) void addFiles(fs).then((added) => { if (added.length) pushNotice("success", "Files added"); });
      };
      input.click();
    } },
  ];
  return (
    <div>
      <WidgetHeader title="Quick actions" icon={<IconPlus size={12} />} />
      <div className="grid grid-cols-2 gap-1.5">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.run}
            className="flex items-center gap-2 px-2.5 py-2 rounded-[8px] border border-line text-[12.5px] font-medium text-ink hover:bg-surface-2 hover:border-line-strong transition-colors"
          >
            <span className="text-ink-3">{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- stats -----------------------------------------------------------------
export function StatsWidget(_props: WidgetProps) {
  const { pages, tasks, files } = useApp();
  const today = isoDate();
  const openTasks = tasks.filter((t) => !t.completed).length;
  const dueToday = tasks.filter((t) => !t.completed && t.dueDate === today).length;
  const items = [
    { label: "Pages", value: pages.length, icon: <IconPage size={14} className="text-ink-3" /> },
    { label: "Open tasks", value: openTasks, icon: <IconTasks size={14} className="text-ink-3" /> },
    { label: "Due today", value: dueToday, icon: <IconCalendar size={14} className="text-ink-3" /> },
    { label: "Files", value: files.length, icon: <IconUpload size={14} className="text-ink-3" /> },
  ];
  return (
    <div>
      <WidgetHeader title="Productivity" icon={<IconChart size={12} />} />
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((s) => (
          <div key={s.label} className="flex items-center gap-2.5 rounded-[8px] border border-line px-3 py-2.5">
            {s.icon}
            <div>
              <div className="font-display font-semibold text-[17px] leading-none tabular-nums">{s.value}</div>
              <div className="mt-1 text-[10.5px] text-ink-3">{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- misc shared (used by the library to preview sizes) --------------------
export function WidgetTypeIcon({ type, size = 15 }: { type: string; size?: number }) {
  const common = { size } as const;
  switch (type) {
    case "clock": return <IconClock {...common} />;
    case "calendar": return <IconCalendar {...common} />;
    case "pomodoro": return <IconPlay {...common} />;
    case "quick-note": return <IconPen {...common} />;
    case "todays-tasks": return <IconTasks {...common} />;
    case "favorites": return <IconStar {...common} />;
    case "recent-pages": return <IconPage {...common} />;
    case "countdown": return <IconHourglass {...common} />;
    case "sticky-note": return <IconNoteSticky {...common} />;
    case "quote": return <IconQuote {...common} />;
    case "quick-actions": return <IconPlus {...common} />;
    case "stats": return <IconChart {...common} />;
    default: return <IconPage {...common} />;
  }
}
