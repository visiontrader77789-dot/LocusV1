"use client";

import { useState } from "react";
import { useApp } from "@/lib/store/app";
import type { CoverPresetId } from "@/lib/core/types";
import { LocusMark } from "@/components/mark";
import { Button } from "@/components/primitives";
import { IconCheck, IconPen, IconX } from "@/components/icons";

/** A curated cover. Layout, type, and overlays are fixed by the design system. */
export interface CoverPreset {
  id: CoverPresetId;
  name: string;
  /** CSS background for the cover surface. */
  background: string;
  /** Where the text reads best: light = pale text, dark = ink text. */
  tone: "light" | "dark";
}

export const COVER_PRESETS: CoverPreset[] = [
  {
    id: "patina",
    name: "Patina pine",
    tone: "light",
    background: "linear-gradient(135deg, #1c6052 0%, #164a40 55%, #0e332c 100%)",
  },
  {
    id: "ink",
    name: "Ink",
    tone: "light",
    background: "linear-gradient(135deg, #2b2c31 0%, #1c1d21 55%, #101114 100%)",
  },
  {
    id: "dusk",
    name: "Dusk",
    tone: "light",
    background: "linear-gradient(135deg, #31435c 0%, #22303f 55%, #161f2c 100%)",
  },
  {
    id: "clay",
    name: "Clay",
    tone: "light",
    background: "linear-gradient(135deg, #844b3b 0%, #67382c 55%, #4a271f 100%)",
  },
  {
    id: "bark",
    name: "Bark",
    tone: "light",
    background: "linear-gradient(135deg, #715c3c 0%, #55442a 55%, #3c2f1d 100%)",
  },
  {
    id: "paper",
    name: "Paper",
    tone: "dark",
    background: "linear-gradient(135deg, #f7f6f3 0%, #edeae2 60%, #e1ddd1 100%)",
  },
];

const presetById = (id: CoverPresetId | undefined): CoverPreset =>
  COVER_PRESETS.find((p) => p.id === id) ?? COVER_PRESETS[0];

export const COVER_DEFAULT_SUBTITLE = "Everything lives on this device. Nothing leaves it.";

function CoverDate() {
  const d = new Date();
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${weekday} · ${date}`;
}

export function Cover() {
  const { workspace, settings, updateSettings } = useApp();
  const preset = presetById(settings?.coverPreset);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{
    preset: CoverPresetId;
    title: string;
    subtitle: string;
  } | null>(null);

  const startEdit = () => {
    setDraft({
      preset: preset.id,
      title: settings?.coverTitle ?? "",
      subtitle: settings?.coverSubtitle ?? "",
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditing(false);
  };

  const saveEdit = () => {
    if (!draft) return;
    void updateSettings({
      coverPreset: draft.preset,
      coverTitle: draft.title.trim(),
      coverSubtitle: draft.subtitle.trim(),
    });
    setDraft(null);
    setEditing(false);
  };

  const title = settings?.coverTitle?.trim() || workspace?.name || "My workspace";
  const subtitle = settings?.coverSubtitle?.trim() || COVER_DEFAULT_SUBTITLE;

  const fg = preset.tone === "light" ? "text-white" : "text-ink";
  const fgDim = preset.tone === "light" ? "text-white/75" : "text-ink-2";
  const fgFaint = preset.tone === "light" ? "text-white/55" : "text-ink-3";
  const gridColor = preset.tone === "light" ? "rgba(255,255,255,0.5)" : "rgba(12,14,16,0.45)";
  const watermark = preset.tone === "light" ? "text-white/10" : "text-ink/10";

  return (
    <header aria-label="Home cover" className="mb-10">
      <div
        className="relative overflow-hidden rounded-2xl shadow-[var(--shadow-2)] ring-1 ring-inset ring-white/10 select-none"
        style={{ background: preset.background }}
      >
        <div className="cover-grid absolute inset-0" style={{ color: gridColor }} aria-hidden="true" />
        <div
          className={`absolute -bottom-10 -right-6 pointer-events-none ${watermark}`}
          aria-hidden="true"
        >
          <LocusMark size={200} strokeWidth={1} />
        </div>

        <div className="relative flex flex-col justify-between min-h-[224px] sm:min-h-[264px] px-5 sm:px-8 pt-5 pb-6 sm:pb-8">
          <div className="flex items-center justify-between gap-3">
            <p className={`font-mono text-[10px] sm:text-[11px] tracking-[0.18em] uppercase ${fgFaint}`}>
              {workspace?.name ?? "Workspace"} · Local
            </p>
            <p className={`font-mono text-[10px] sm:text-[11px] tracking-[0.18em] uppercase ${fgFaint}`}>
              <CoverDate />
            </p>
          </div>

          <div className="mt-auto">
            <h1
              className={`font-display font-semibold tracking-tight leading-[1.04] text-[clamp(30px,6vw,46px)] max-w-[14ch] ${fg}`}
            >
              {title}
            </h1>
            <p className={`mt-3 max-w-[46ch] text-[13.5px] sm:text-[15px] leading-relaxed ${fgDim}`}>
              {subtitle}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={startEdit}
          aria-label="Edit cover"
          className={`absolute top-3 right-3 inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2.5 rounded-full text-[11.5px] font-medium border transition-colors ${
            preset.tone === "light"
              ? "text-white/85 border-white/25 bg-white/10 hover:bg-white/20 hover:text-white"
              : "text-ink-2 border-line-strong bg-surface/70 backdrop-blur-sm hover:bg-surface"
          }`}
        >
          <IconPen size={12} />
          <span className="hidden sm:inline">Edit cover</span>
        </button>
      </div>

      {editing && draft && (
        <div className="panel mt-3 px-4 py-4 sm:px-5 anim-rise" role="group" aria-label="Edit cover">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">Cover</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={cancelEdit}>
                <IconX size={12} />
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={saveEdit}>
                <IconCheck size={12} />
                Save cover
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            {COVER_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.name}
                aria-label={`Cover: ${p.name}`}
                aria-pressed={draft.preset === p.id}
                onClick={() => setDraft((d) => (d ? { ...d, preset: p.id } : d))}
                className={`h-10 w-16 rounded-lg border-2 transition-transform hover:scale-[1.04] ${
                  draft.preset === p.id
                    ? "border-accent"
                    : "border-line hover:border-line-strong"
                }`}
                style={{ background: p.background }}
              />
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[12px] text-ink-2 mb-1">Title</div>
              <input
                className="text-input w-full"
                value={draft.title}
                placeholder={workspace?.name ?? "Workspace name"}
                maxLength={120}
                onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
              />
            </div>
            <div>
              <div className="text-[12px] text-ink-2 mb-1">Subtitle</div>
              <input
                className="text-input w-full"
                value={draft.subtitle}
                placeholder={COVER_DEFAULT_SUBTITLE}
                maxLength={240}
                onChange={(e) => setDraft((d) => (d ? { ...d, subtitle: e.target.value } : d))}
              />
            </div>
          </div>

          <p className="mt-3 text-[11.5px] text-ink-3">
            Choose from Locus&apos;s curated covers. The layout, type and overlays stay fixed — only the
            preset, title and subtitle change.
          </p>
        </div>
      )}
    </header>
  );
}
