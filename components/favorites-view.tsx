"use client";

import { useApp } from "@/lib/store/app";
import { navigate } from "@/lib/store/router";
import { relativeTime, formatBytes } from "@/lib/core/util";
import { EmptyState } from "@/components/primitives";
import {
  IconFileOther, IconPage, IconStarFilled, IconTasks,
} from "@/components/icons";

export function FavoritesView() {
  const { favorites, toggleFavoritePage, toggleFavoriteTask, toggleFavoriteFile } = useApp();

  const empty =
    favorites.pages.length === 0 && favorites.tasks.length === 0 && favorites.files.length === 0;

  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-8">
      <header className="mb-5">
        <h1 className="font-display font-semibold tracking-tight text-[26px] leading-tight">Favorites</h1>
        <p className="mt-1 text-[13px] text-ink-2">
          Star anything in Locus to pin it here.
        </p>
      </header>

      {empty ? (
        <EmptyState
          title="Nothing starred yet"
          body="Use the star on pages, tasks and files to pin them here for quick access."
        />
      ) : (
        <div className="space-y-7">
          {favorites.pages.length > 0 && (
            <section>
              <h2 className="eyebrow mb-2">Pages · {favorites.pages.length}</h2>
              <div className="space-y-1">
                {favorites.pages.map((page) => (
                  <div key={page.id} className="group flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] hover:bg-surface-2 transition-colors">
                    <button type="button" onClick={() => navigate({ name: "page", id: page.id })} className="flex-1 min-w-0 flex items-center gap-2.5 text-left">
                      <span className="w-5 h-5 shrink-0 flex items-center justify-center text-[14px]">
                        {page.icon ? <span>{page.icon}</span> : <IconPage size={13} className="text-ink-3" />}
                      </span>
                      <span className="flex-1 min-w-0 text-[13.5px] font-medium truncate">{page.title}</span>
                      <span className="font-mono text-[10.5px] text-ink-3 shrink-0">{relativeTime(page.updatedAt)}</span>
                    </button>
                    <button type="button" aria-label="Unfavorite" className="icon-btn !w-6 !h-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => void toggleFavoritePage(page.id)}>
                      <IconStarFilled size={13} className="text-warn" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {favorites.tasks.length > 0 && (
            <section>
              <h2 className="eyebrow mb-2">Tasks · {favorites.tasks.length}</h2>
              <div className="space-y-1">
                {favorites.tasks.map((task) => (
                  <div key={task.id} className="group flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] hover:bg-surface-2 transition-colors">
                    <IconTasks size={13} className="text-accent shrink-0" />
                    <span className={`flex-1 min-w-0 text-[13.5px] truncate ${task.completed ? "line-through text-ink-3" : ""}`}>{task.title}</span>
                    <button type="button" aria-label="Unfavorite" className="icon-btn !w-6 !h-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => void toggleFavoriteTask(task.id)}>
                      <IconStarFilled size={13} className="text-warn" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {favorites.files.length > 0 && (
            <section>
              <h2 className="eyebrow mb-2">Files · {favorites.files.length}</h2>
              <div className="space-y-1">
                {favorites.files.map((file) => (
                  <div key={file.id} className="group flex items-center gap-2.5 px-2.5 py-2 rounded-[6px] hover:bg-surface-2 transition-colors">
                    <span className="w-5 h-5 shrink-0 flex items-center justify-center text-ink-3">
                      <IconFileOther size={13} />
                    </span>
                    <button type="button" onClick={() => navigate({ name: "files" })} className="flex-1 min-w-0 text-left">
                      <span className="block text-[13.5px] font-medium truncate">{file.name}</span>
                      <span className="block font-mono text-[10.5px] text-ink-3">{formatBytes(file.size)}</span>
                    </button>
                    <button type="button" aria-label="Unfavorite" className="icon-btn !w-6 !h-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => void toggleFavoriteFile(file.id)}>
                      <IconStarFilled size={13} className="text-warn" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
