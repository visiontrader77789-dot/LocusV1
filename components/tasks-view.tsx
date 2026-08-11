"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/store/app";
import { navigate } from "@/lib/store/router";
import type { Task, TaskPriority } from "@/lib/core/types";
import { humanDate, isOverdue, isoDate, relativeTime, compareDates } from "@/lib/core/util";
import { Button, EmptyState, Menu, MenuItem, MenuSeparator, Select } from "@/components/primitives";
import { IconCheck, IconClock, IconMore, IconPage, IconPlus, IconStar, IconStarFilled, IconTrash } from "@/components/icons";

type Filter = "open" | "done" | "all";
type Sort = "due" | "priority" | "newest";

const PRIORITIES: Array<{ value: TaskPriority; label: string }> = [
  { value: 0, label: "No priority" },
  { value: 1, label: "Low" },
  { value: 2, label: "Medium" },
  { value: 3, label: "High" },
];

function priorityClass(p: TaskPriority): string {
  if (p === 3) return "bg-danger-soft text-danger";
  if (p === 2) return "bg-[color:var(--warn)]/10 text-warn";
  if (p === 1) return "bg-surface-2 text-ink-2";
  return "bg-surface-2 text-ink-3";
}

function TaskRow({ task }: { task: Task }) {
  const { updateTask, deleteTask, toggleFavoriteTask, pageById } = useApp();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const page = task.pageId ? pageById.get(task.pageId) : undefined;

  const commitTitle = () => {
    const v = title.trim();
    if (v && v !== task.title) void updateTask(task.id, { title: v });
    else setTitle(task.title);
    setEditing(false);
  };

  const dueClass = task.dueDate && isOverdue(task.dueDate) && !task.completed ? "text-danger" : "text-ink-3";

  return (
    <div className={`group flex items-start gap-2.5 px-3 py-2.5 rounded-[6px] hover:bg-surface-2 transition-colors ${task.completed ? "opacity-60" : ""}`}>
      <button
        type="button"
        aria-label={task.completed ? "Mark open" : "Mark done"}
        onClick={() => void updateTask(task.id, { completed: !task.completed })}
        className={`mt-[3px] w-[16px] h-[16px] shrink-0 rounded-[4px] border flex items-center justify-center transition-colors ${
          task.completed ? "bg-accent border-accent text-accent-ink" : "border-line-strong hover:border-accent"
        }`}
      >
        {task.completed && <IconCheck size={11} />}
      </button>

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") { setTitle(task.title); setEditing(false); }
            }}
            className="w-full bg-transparent border border-accent rounded-[4px] px-1.5 py-0.5 text-[13.5px] focus:outline-none"
            aria-label="Task title"
          />
        ) : (
          <div
            className={`text-[13.5px] ${task.completed ? "line-through text-ink-3" : "text-ink"}`}
            onDoubleClick={() => { setTitle(task.title); setEditing(true); }}
            title="Double-click to edit"
          >
            {task.title}
          </div>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {task.priority > 0 && (
            <span className={`inline-flex items-center h-[18px] px-1.5 rounded-[4px] text-[10.5px] font-medium ${priorityClass(task.priority)}`}>
              {PRIORITIES.find((p) => p.value === task.priority)?.label}
            </span>
          )}
          {task.dueDate && (
            <span className={`inline-flex items-center gap-1 font-mono text-[10.5px] ${dueClass}`}>
              <IconClock size={11} />
              {task.dueDate === isoDate() ? "today" : humanDate(task.dueDate)}
            </span>
          )}
          {task.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center h-[18px] px-1.5 rounded-[4px] bg-accent-soft text-accent text-[10.5px] font-medium">
              #{tag}
            </span>
          ))}
          {page && (
            <button
              type="button"
              onClick={() => navigate({ name: "page", id: page.id })}
              className="inline-flex items-center gap-1 h-[18px] px-1.5 rounded-[4px] bg-surface-2 text-ink-2 text-[10.5px] hover:text-accent transition-colors"
            >
              {page.icon && <span>{page.icon}</span>}
              <IconPage size={11} />
              {page.title}
            </button>
          )}
          <span className="font-mono text-[10px] text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity">
            {relativeTime(task.updatedAt)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          aria-label={task.favorite ? "Unfavorite" : "Favorite"}
          className="icon-btn !w-6 !h-6"
          onClick={() => void toggleFavoriteTask(task.id)}
        >
          {task.favorite ? <IconStarFilled size={13} className="text-warn" /> : <IconStar size={13} />}
        </button>
        <Menu
          width={200}
          trigger={(open) => (
            <button type="button" aria-label="Task options" className={`icon-btn !w-6 !h-6 ${open ? "bg-surface-2" : ""}`}>
              <IconMore size={14} />
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="px-2.5 pt-2 pb-1.5">
                <div className="eyebrow mb-1">Priority</div>
                <Select
                  value={String(task.priority)}
                  onChange={(v) => void updateTask(task.id, { priority: Number(v) as TaskPriority })}
                  options={PRIORITIES.map((p) => ({ value: String(p.value), label: p.label }))}
                  className="w-full"
                />
              </div>
              <MenuSeparator />
              <MenuItem
                leading={task.favorite ? <IconStarFilled size={13} /> : <IconStar size={13} />}
                onClick={() => { void toggleFavoriteTask(task.id); close(); }}
              >
                {task.favorite ? "Remove favorite" : "Add to favorites"}
              </MenuItem>
              <MenuItem danger leading={<IconTrash size={13} />} onClick={() => { void deleteTask(task.id); close(); }}>
                Delete
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </div>
  );
}

export function TasksView() {
  const { tasks, createTask } = useApp();
  const [filter, setFilter] = useState<Filter>("open");
  const [sort, setSort] = useState<Sort>("due");
  const [newTitle, setNewTitle] = useState("");

  const visible = useMemo(() => {
    let list = tasks;
    if (filter === "open") list = list.filter((t) => !t.completed);
    if (filter === "done") list = list.filter((t) => t.completed);

    const prio = (t: Task) => t.priority;
    const sorted = [...list].sort((a, b) => {
      if (sort === "priority") return prio(b) - prio(a) || a.createdAt - b.createdAt;
      if (sort === "newest") return b.createdAt - a.createdAt;
      // due: undated last, overdue first
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const d = compareDates(a.dueDate, b.dueDate);
      if (d !== 0) return d;
      return prio(b) - prio(a);
    });
    return sorted;
  }, [tasks, filter, sort]);

  const openCount = tasks.filter((t) => !t.completed).length;
  const doneCount = tasks.length - openCount;

  const add = () => {
    const v = newTitle.trim();
    if (!v) return;
    void createTask(v);
    setNewTitle("");
  };

  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-8">
      <header className="mb-5">
        <h1 className="font-display font-semibold tracking-tight text-[26px] leading-tight">Tasks</h1>
        <p className="mt-1 text-[13px] text-ink-2">
          {openCount} open · {doneCount} done
        </p>
      </header>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2.5 px-3 h-9 rounded-[6px] border border-line bg-surface focus-within:border-accent transition-colors">
          <IconPlus size={14} className="text-ink-3 shrink-0" />
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Add a task and press Enter"
            className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-3"
            aria-label="New task"
          />
        </div>
        <Button variant="primary" onClick={add} disabled={!newTitle.trim()}>
          Add
        </Button>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          {(["open", "done", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`h-7 px-2.5 rounded-[5px] text-[12.5px] transition-colors ${
                filter === f ? "bg-accent-soft text-accent font-medium" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {f === "open" ? `Open ${openCount}` : f === "done" ? `Done ${doneCount}` : "All"}
            </button>
          ))}
        </div>
        <Select
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          options={[
            { value: "due", label: "Sort by due date" },
            { value: "priority", label: "Sort by priority" },
            { value: "newest", label: "Sort by newest" },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={filter === "done" ? "Nothing done yet" : "All clear"}
          body={filter === "done" ? "Completed tasks will collect here." : "Add a task above to get started."}
        />
      ) : (
        <div className="panel divide-y divide-line">
          {visible.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
