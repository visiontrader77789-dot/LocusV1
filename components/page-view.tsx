"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store/app";
import { navigate } from "@/lib/store/router";
import { onRequestPageRename } from "@/lib/store/events";
import { collectDescendants } from "@/lib/core/tree";
import type { Page } from "@/lib/core/types";
import { Editor } from "@/components/editor/editor";
import { Menu, MenuItem, MenuSeparator } from "@/components/primitives";
import { Button, EmptyState } from "@/components/primitives";
import { EmojiPicker } from "@/components/emoji-picker";
import {
  IconCheck, IconCopy, IconMore, IconPlus, IconStar, IconStarFilled, IconTrash,
} from "@/components/icons";

function PageHeader({ page }: { page: Page }) {
  const {
    renamePage, toggleFavoritePage, duplicatePage, deletePage, setPageIcon,
    confirm, pushNotice, pages,
  } = useApp();

  const [title, setTitle] = useState(page.title);
  const [iconPicker, setIconPicker] = useState(false);
  const savedRef = useRef(page.title);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTitle(page.title); }, [page.title]);

  // "Rename page" shortcut (F2): focus and select the whole title.
  useEffect(() => onRequestPageRename(() => {
    const el = titleRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }), []);

  const commitTitle = () => {
    const v = title.trim();
    if (v && v !== savedRef.current) {
      savedRef.current = v;
      void renamePage(page.id, v);
    } else if (!v) {
      setTitle(savedRef.current);
    }
  };

  const handleDelete = () => {
    const descendants = collectDescendants(page.id, pages, true).length;
    confirm({
      title: "Delete this page?",
      body:
        descendants > 1
          ? `"${page.title}" and ${descendants - 1} nested page${descendants - 1 > 1 ? "s" : ""} will be deleted. Tasks keep existing but are unlinked. This can't be undone.`
          : `"${page.title}" will be deleted. This can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => void deletePage(page.id),
    });
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      pushNotice("success", "Link copied");
    });
  };

  return (
    <div className="mb-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label="Set page icon"
          title="Set icon"
          onClick={() => setIconPicker(true)}
          className={`w-11 h-11 shrink-0 flex items-center justify-center rounded-[8px] border text-[22px] transition-colors ${
            iconPicker ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong"
          }`}
        >
          {page.icon ? <span>{page.icon}</span> : <IconPlus size={16} className="text-ink-3" />}
        </button>
        {iconPicker && (
          <EmojiPicker
            onPick={(char) => void setPageIcon(page.id, char)}
            onClose={() => setIconPicker(false)}
          />
        )}

        <div className="flex-1 min-w-0">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            aria-label="Page title"
            spellCheck={false}
            className="w-full bg-transparent font-display font-semibold tracking-tight text-[26px] leading-tight text-ink outline-none placeholder:text-ink-3"
            placeholder="Untitled"
          />
          <div className="mt-1 text-[12px] text-ink-3">
            {page.updatedAt ? `Edited ${new Date(page.updatedAt).toLocaleDateString()}` : ""}
          </div>
        </div>

        <Menu
          width={200}
          trigger={(open) => (
            <button
              type="button"
              aria-label="Page options"
              className={`icon-btn ${open ? "bg-surface-2 text-ink" : ""}`}
            >
              <IconMore size={16} />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                leading={page.favorite ? <IconStarFilled size={13} /> : <IconStar size={13} />}
                onClick={() => { void toggleFavoritePage(page.id); close(); }}
              >
                {page.favorite ? "Unfavorite" : "Favorite"}
              </MenuItem>
              {page.icon && (
                <MenuItem leading={<IconTrash size={13} />} onClick={() => { void setPageIcon(page.id, ""); close(); }}>
                  Remove icon
                </MenuItem>
              )}
              <MenuItem leading={<IconCopy size={13} />} onClick={() => { copyLink(); close(); }}>
                Copy link
              </MenuItem>
              <MenuItem
                leading={<IconPlus size={13} />}
                onClick={() => {
                  void duplicatePage(page.id).then((copy) => {
                    close();
                    if (copy) navigate({ name: "page", id: copy.id });
                  });
                }}
              >
                Duplicate
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger leading={<IconTrash size={13} />} onClick={() => { close(); handleDelete(); }}>
                Delete
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </div>
  );
}

function Backlinks({ pageId }: { pageId: string }) {
  const { backlinksForPage, pageById } = useApp();
  const refs = backlinksForPage(pageId);
  if (refs.length === 0) return null;

  const byPage = new Map<string, string[]>();
  for (const ref of refs) {
    const list = byPage.get(ref.pageId) ?? [];
    list.push(ref.snippet);
    byPage.set(ref.pageId, list);
  }

  return (
    <section className="mt-10 pt-6 border-t border-line">
      <div className="eyebrow mb-2">Linked back · {refs.length}</div>
      <div className="space-y-1.5">
        {[...byPage.entries()].map(([pid, snippets]) => {
          const p = pageById.get(pid);
          if (!p) return null;
          return (
            <button
              key={pid}
              type="button"
              onClick={() => navigate({ name: "page", id: pid })}
              className="block w-full text-left px-2.5 py-2 rounded-[6px] hover:bg-surface-2 transition-colors"
            >
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                {p.icon && <span>{p.icon}</span>}
                <span className="truncate">{p.title}</span>
                <IconCheck size={11} className="text-ink-3" />
              </div>
              {snippets.slice(0, 2).map((s, i) => (
                <div key={i} className="mt-0.5 pl-1 text-[12.5px] text-ink-2 truncate">
                  {s}
                </div>
              ))}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function PageView({ pageId }: { pageId: string }) {
  const { pageById } = useApp();
  const page = pageById.get(pageId);

  if (!page) {
    return (
      <EmptyState
        title="Page not found"
        body="This page was deleted or the link is broken."
        action={
          <Button variant="secondary" onClick={() => navigate({ name: "dashboard" })}>
            Back to home
          </Button>
        }
      />
    );
  }

  return (
    <article className="max-w-[720px] mx-auto px-4 sm:px-6 py-8">
      <PageHeader page={page} />
      <Editor key={pageId} pageId={pageId} />
      <Backlinks pageId={pageId} />
    </article>
  );
}
