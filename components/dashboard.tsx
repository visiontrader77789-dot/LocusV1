"use client";

import { useRef } from "react";
import { useApp } from "@/lib/store/app";
import { navigate } from "@/lib/store/router";
import { openPalette } from "@/lib/store/events";
import { relativeTime, isoDate, isOverdue } from "@/lib/core/util";
import { EmptyState } from "@/components/primitives";
import { LocusMark } from "@/components/mark";
import { IconFiles, IconPage, IconPlus, IconSearch, IconStar, IconTasks, IconUpload } from "@/components/icons";
import { DashboardWidgets } from "@/components/widgets/grid";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function Dashboard() {
  const { workspace, recentPages, favorites, tasks, files, createPage, createTask, addFiles, pushNotice } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  const openTasks = tasks.filter((t) => !t.completed).slice(0, 5);
  const dueToday = openTasks.filter((t) => t.dueDate === isoDate());
  const overdue = openTasks.filter((t) => t.dueDate && isOverdue(t.dueDate));

  const quickActions = [
    {
      label: "New page",
      icon: <IconPage size={15} />,
      run: () => void createPage(null).then((p) => navigate({ name: "page", id: p.id })),
    },
    {
      label: "New task",
      icon: <IconTasks size={15} />,
      run: () => {
        const title = window.prompt("Task title");
        if (title?.trim()) void createTask(title.trim()).then(() => pushNotice("success", "Task added"));
      },
    },
    {
      label: "Search everything",
      icon: <IconSearch size={15} />,
      run: () => openPalette(),
      kbd: "Ctrl K",
    },
    {
      label: "Upload a file",
      icon: <IconUpload size={15} />,
      run: () => fileRef.current?.click(),
    },
  ];

  return (
    <div className="max-w-[860px] mx-auto px-4 sm:px-6 py-8">
      <header className="mb-7">
        <p className="font-mono text-[11px] text-ink-3 uppercase tracking-[0.12em]">
          {workspace?.name ?? "Workspace"}
        </p>
        <h1 className="mt-1 font-display font-semibold tracking-tight text-[26px] leading-tight">
          {greeting()}.
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-2">
          Everything here lives on this device. Nothing leaves it.
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
        {quickActions.map((qa) => (
          <button
            key={qa.label}
            type="button"
            onClick={qa.run}
            className="panel flex flex-col items-start gap-2.5 px-3.5 py-3 text-left hover:border-line-strong hover:bg-surface-2 transition-colors"
          >
            <span className="text-ink-3">{qa.icon}</span>
            <span className="text-[13px] font-medium">{qa.label}</span>
            {qa.kbd && <span className="font-mono text-[10px] text-ink-3">{qa.kbd}</span>}
          </button>
        ))}
      </div>

      <DashboardWidgets />

      {recentPages.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="eyebrow">Recent pages</h2>
            <button
              type="button"
              className="flex items-center gap-1 text-[12px] text-ink-2 hover:text-ink"
              onClick={() => navigate({ name: "dashboard" })}
            >
              <IconPlus size={12} />
              <span>New page</span>
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {recentPages.slice(0, 4).map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => navigate({ name: "page", id: page.id })}
                className="panel flex items-center gap-3 px-3.5 py-3 text-left hover:border-line-strong hover:bg-surface-2 transition-colors"
              >
                <span className="w-8 h-8 shrink-0 flex items-center justify-center rounded-[8px] bg-surface-2 border border-line text-[16px]">
                  {page.icon ? <span>{page.icon}</span> : <IconPage size={15} className="text-ink-3" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium truncate">{page.title}</span>
                  <span className="block font-mono text-[10.5px] text-ink-3">
                    {page.favorite ? "★ " : ""}edited {relativeTime(page.updatedAt)}
                  </span>
                </span>
                <span className="text-ink-3">{page.favorite && <IconStarFilledSmall />}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="grid md:grid-cols-2 gap-8 mb-8">
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="eyebrow">Open tasks</h2>
            <button
              type="button"
              className="text-[12px] text-ink-2 hover:text-ink"
              onClick={() => navigate({ name: "tasks" })}
            >
              View all
            </button>
          </div>
          {openTasks.length === 0 ? (
            <EmptyState compact title="Nothing pending" body="Your open tasks will show up here." />
          ) : (
            <div className="space-y-1">
              {openTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => navigate({ name: "tasks" })}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left hover:bg-surface-2 transition-colors"
                >
                  <span className="w-3.5 h-3.5 shrink-0 rounded-[4px] border border-line-strong" />
                  <span className="flex-1 min-w-0 text-[13px] truncate">{task.title}</span>
                  {task.dueDate && (
                    <span
                      className={`font-mono text-[10px] shrink-0 ${
                        isOverdue(task.dueDate) ? "text-danger" : "text-ink-3"
                      }`}
                    >
                      {task.dueDate === isoDate() ? "today" : task.dueDate}
                    </span>
                  )}
                </button>
              ))}
              {(dueToday.length > 0 || overdue.length > 0) && (
                <p className="pt-1 pl-2.5 text-[11px] text-ink-3">
                  {overdue.length > 0 && <span className="text-danger">{overdue.length} overdue · </span>}
                  {dueToday.length > 0 && <span>{dueToday.length} due today</span>}
                </p>
              )}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="eyebrow">Favorites</h2>
            <button
              type="button"
              className="text-[12px] text-ink-2 hover:text-ink"
              onClick={() => navigate({ name: "favorites" })}
            >
              View all
            </button>
          </div>
          {favorites.pages.length === 0 && favorites.tasks.length === 0 && favorites.files.length === 0 ? (
            <EmptyState
              compact
              title="Nothing starred yet"
              body="Star pages, tasks and files to pin them here."
            />
          ) : (
            <div className="space-y-1">
              {favorites.pages.slice(0, 4).map((page) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => navigate({ name: "page", id: page.id })}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left hover:bg-surface-2 transition-colors"
                >
                  <span className="w-5 h-5 shrink-0 flex items-center justify-center text-[14px]">
                    {page.icon ? <span>{page.icon}</span> : <IconPage size={13} className="text-ink-3" />}
                  </span>
                  <span className="flex-1 min-w-0 text-[13px] truncate">{page.title}</span>
                  <IconStarFilledSmall />
                </button>
              ))}
              {favorites.files.length > 0 && (
                <button
                  type="button"
                  onClick={() => navigate({ name: "files" })}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] text-left hover:bg-surface-2 transition-colors"
                >
                  <IconFiles size={13} className="text-ink-3 shrink-0" />
                  <span className="flex-1 min-w-0 text-[13px] truncate">
                    {favorites.files.length} file{favorites.files.length > 1 ? "s" : ""}
                  </span>
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {files.length === 0 && (
        <div className="flex items-center gap-3 rounded-[8px] border border-dashed border-line-strong px-4 py-3 text-[12.5px] text-ink-3">
          <LocusMark size={16} className="text-accent shrink-0" />
          Tip: press Ctrl/⌘ K to search anything, or type / inside a page to add blocks.
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          if (fs.length) void addFiles(fs).then((added) => {
            if (added.length) pushNotice("success", "Files added");
          });
          e.target.value = "";
        }}
      />
    </div>
  );
}

function IconStarFilledSmall() {
  return <IconStar size={12} className="text-warn shrink-0" />;
}
