"use client";

import { useMemo, useRef, useState } from "react";
import {
  EMOJI_CATEGORIES,
  getFrequentEmoji,
  getRecentEmoji,
  recordEmojiUse,
  searchEmoji,
  type EmojiEntry,
} from "@/lib/core/emoji";
import { IconSearch } from "@/components/icons";

function EmojiGrid({ emojis, onPick }: { emojis: EmojiEntry[]; onPick: (e: EmojiEntry) => void }) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emojis.map((e) => (
        <button
          key={e.char}
          type="button"
          aria-label={`Emoji ${e.char}`}
          className="h-9 w-9 flex items-center justify-center rounded-[6px] text-[19px] hover:bg-surface-2 transition-colors"
          onClick={() => onPick(e)}
        >
          {e.char}
        </button>
      ))}
    </div>
  );
}

/**
 * Curated local emoji picker. Renders a centered popover with search,
 * recent/frequent sections and category chips. Picking records the emoji.
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
  const inputRef = useRef<HTMLInputElement>(null);
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

  const pick = (e: EmojiEntry) => {
    recordEmojiUse(e.char);
    onPick(e.char);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Choose an emoji">
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
              <EmojiGrid emojis={results} onPick={pick} />
            )
          ) : showDefault ? (
            <EmojiGrid emojis={defaultCat.emojis} onPick={pick} />
          ) : category !== null ? (
            <EmojiGrid emojis={catEmojis ?? []} onPick={pick} />
          ) : (
            <>
              {recent.length > 0 && (
                <>
                  <p className="eyebrow mb-1.5">Recent</p>
                  <EmojiGrid emojis={recent} onPick={pick} />
                </>
              )}
              {frequent.length > 0 && (
                <>
                  <p className="eyebrow mb-1.5 mt-3">Frequent</p>
                  <EmojiGrid emojis={frequent} onPick={pick} />
                </>
              )}
            </>
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
