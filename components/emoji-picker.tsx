"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  EMOJI_CATEGORIES,
  getFrequentEmoji,
  getRecentEmoji,
  recordEmojiUse,
  searchEmoji,
  type EmojiEntry,
} from "@/lib/core/emoji";
import { IconSearch } from "@/components/icons";

const GRID_COLS = 8;

function EmojiGrid({
  emojis,
  startIndex,
  focusIdx,
  btnRefs,
  onPick,
}: {
  emojis: EmojiEntry[];
  startIndex: number;
  focusIdx: number;
  btnRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  onPick: (e: EmojiEntry) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emojis.map((e, i) => {
        const idx = startIndex + i;
        const isFocused = idx === focusIdx;
        return (
          <button
            key={e.char}
            type="button"
            ref={(el) => {
              btnRefs.current[idx] = el;
            }}
            aria-label={`Emoji ${e.char}`}
            data-emoji-index={idx}
            tabIndex={isFocused ? 0 : -1}
            className={`h-9 w-9 flex items-center justify-center rounded-[6px] text-[19px] transition-colors ${
              isFocused ? "bg-surface-2 ring-1 ring-accent" : "hover:bg-surface-2"
            }`}
            onClick={() => onPick(e)}
          >
            {e.char}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Curated local emoji picker. Renders a centered popover with search,
 * recent/frequent sections and category chips. Keyboard: arrows move across
 * the emoji grid, Enter picks, Escape closes. Picking records the emoji.
 */
export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (char: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const recent = useMemo(() => getRecentEmoji(), []);
  const frequent = useMemo(() => getFrequentEmoji(), []);

  const q = query.trim();

  const searching = q.length > 0;
  const results = useMemo(() => (searching ? searchEmoji(q) : []), [searching, q]);
  const catEmojis = useMemo(() => {
    if (searching || category === null) return null;
    const cat = EMOJI_CATEGORIES.find((c) => c.id === category);
    return cat ? cat.emojis : [];
  }, [searching, category]);

  const showDefault = !searching && category === null && recent.length === 0 && frequent.length === 0;
  const defaultCat = EMOJI_CATEGORIES[0];

  const allView = !searching && category === null && !showDefault;

  const gridEmojis = useMemo<EmojiEntry[]>(() => {
    if (searching) return results;
    if (showDefault) return defaultCat.emojis;
    if (category !== null) return catEmojis ?? [];
    return [...recent, ...frequent];
  }, [searching, results, showDefault, defaultCat, category, catEmojis, recent, frequent]);

  const gridKey = searching ? `s:${q}` : category ?? "all";

  useEffect(() => {
    setFocusIdx(-1);
  }, [gridKey]);

  useEffect(() => {
    if (focusIdx >= 0) {
      const el = btnRefs.current[focusIdx];
      el?.focus();
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [focusIdx, gridKey]);

  const pick = (e: EmojiEntry) => {
    recordEmojiUse(e.char);
    onPick(e.char);
    onClose();
  };

  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      onClose();
      return;
    }
    const len = gridEmojis.length;
    const inInput = ev.target === inputRef.current;
    if (inInput) {
      if (ev.key === "Enter" && len > 0) {
        ev.preventDefault();
        pick(gridEmojis[0]);
      }
      return;
    }
    if (len === 0) return;
    switch (ev.key) {
      case "ArrowDown":
        ev.preventDefault();
        setFocusIdx((p) => (p < 0 ? 0 : Math.min(p + GRID_COLS, len - 1)));
        break;
      case "ArrowUp":
        ev.preventDefault();
        setFocusIdx((p) => (p < 0 ? 0 : Math.max(p - GRID_COLS, 0)));
        break;
      case "ArrowRight":
        ev.preventDefault();
        setFocusIdx((p) => (p < 0 ? 0 : Math.min(p + 1, len - 1)));
        break;
      case "ArrowLeft":
        ev.preventDefault();
        setFocusIdx((p) => (p < 0 ? 0 : Math.max(p - 1, 0)));
        break;
      case "Home":
        ev.preventDefault();
        setFocusIdx(0);
        break;
      case "End":
        ev.preventDefault();
        setFocusIdx(len - 1);
        break;
      case "Enter":
        if (focusIdx >= 0 && focusIdx < len) {
          ev.preventDefault();
          pick(gridEmojis[focusIdx]);
        }
        break;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Choose an emoji" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/35 anim-fade" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-[340px] bg-surface border border-line rounded-[10px] shadow-[var(--shadow-3)] anim-pop overflow-hidden">
        <div className="flex items-center gap-2 px-3 h-10 border-b border-line">
          <IconSearch size={14} className="text-ink-3 shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji…"
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-3"
            aria-label="Search emoji"
          />
        </div>

        <div className="flex gap-1.5 px-3 pt-2.5 pb-1 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={`shrink-0 h-6.5 px-2.5 rounded-full text-[11.5px] font-medium transition-colors ${
              category === null && !searching
                ? "bg-accent-soft text-accent-hi"
                : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            All
          </button>
          {EMOJI_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`shrink-0 h-6.5 px-2.5 rounded-full text-[11.5px] font-medium transition-colors ${
                category === c.id && !searching
                  ? "bg-accent-soft text-accent-hi"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="max-h-[300px] overflow-y-auto p-3">
          {searching ? (
            results.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-ink-3">No emoji match “{q}”</p>
            ) : (
              <EmojiGrid emojis={results} startIndex={0} focusIdx={focusIdx} btnRefs={btnRefs} onPick={pick} />
            )
          ) : allView ? (
            <>
              {recent.length > 0 && (
                <>
                  <p className="eyebrow mb-1.5">Recent</p>
                  <EmojiGrid emojis={recent} startIndex={0} focusIdx={focusIdx} btnRefs={btnRefs} onPick={pick} />
                </>
              )}
              {frequent.length > 0 && (
                <>
                  <p className="eyebrow mb-1.5 mt-3">Frequent</p>
                  <EmojiGrid
                    emojis={frequent}
                    startIndex={recent.length}
                    focusIdx={focusIdx}
                    btnRefs={btnRefs}
                    onPick={pick}
                  />
                </>
              )}
            </>
          ) : (
            <EmojiGrid emojis={gridEmojis} startIndex={0} focusIdx={focusIdx} btnRefs={btnRefs} onPick={pick} />
          )}
        </div>

        <div className="flex justify-end px-3 py-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="h-7 px-3 rounded-[6px] text-[12px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
