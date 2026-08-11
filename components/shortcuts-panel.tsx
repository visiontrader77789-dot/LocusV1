"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { effectiveShortcuts } from "@/lib/shortcuts/overrides";
import { formatCombo } from "@/lib/shortcuts/platform";
import { consumeShortcutsHelpFocus } from "@/lib/shortcuts/registry";
import type { ShortcutDef, ShortcutGroup } from "@/lib/shortcuts/types";
import { Kbd } from "@/components/primitives";
import { IconSearch } from "@/components/icons";

const GROUP_ORDER: ShortcutGroup[] = ["General", "Create", "Navigate", "Page", "Sidebar", "Editor"];

export function KeyboardShortcutsPanel() {
  const [q, setQ] = useState("");
  const sectionRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (consumeShortcutsHelpFocus()) {
      sectionRef.current?.scrollIntoView({ block: "start" });
      const t = window.setTimeout(() => searchRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
  }, []);

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    const defs = effectiveShortcuts().filter((d) => {
      if (!query) return true;
      const hay = `${d.label} ${d.description ?? ""} ${d.combos.map(formatCombo).join(" ")}`.toLowerCase();
      return hay.includes(query);
    });
    const byGroup = new Map<ShortcutGroup, ShortcutDef[]>();
    for (const d of defs) {
      const list = byGroup.get(d.group);
      if (list) list.push(d);
      else byGroup.set(d.group, [d]);
    }
    return GROUP_ORDER.map((g) => ({ group: g, items: byGroup.get(g) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [q]);

  return (
    <section
      id="keyboard-shortcuts"
      ref={sectionRef}
      className="panel px-4 sm:px-5 py-4"
      aria-label="Keyboard shortcuts"
    >
      <h2 className="text-[13.5px] font-semibold">Keyboard shortcuts</h2>
      <p className="mt-0.5 text-[12.5px] text-ink-2">
        Ctrl/⌘ is the platform modifier. Editor shortcuts apply while you&apos;re typing; the rest are
        available anywhere else.
      </p>
      <div className="mt-3 mb-4 relative max-w-[320px]">
        <IconSearch
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
        />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="text-input !pl-8"
          placeholder="Filter shortcuts…"
          aria-label="Filter keyboard shortcuts"
        />
      </div>
      <div className="space-y-4">
        {groups.length === 0 && <p className="text-[12.5px] text-ink-3">No shortcuts match “{q}”.</p>}
        {groups.map(({ group, items }) => (
          <div key={group}>
            <div className="eyebrow mb-1.5">{group}</div>
            <ul className="space-y-1">
              {items.map((d) => (
                <li key={d.id} className="flex items-baseline justify-between gap-3 py-1">
                  <div className="min-w-0">
                    <span className="text-[13px] text-ink">{d.label}</span>
                    {d.description && (
                      <span className="block text-[11.5px] text-ink-3">{d.description}</span>
                    )}
                  </div>
                  <span className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                    {d.combos.map((c, i) => (
                      <span key={i} className="flex items-center gap-1">
                        {i > 0 && <span className="text-ink-3 text-[11px]">·</span>}
                        <Kbd>{formatCombo(c)}</Kbd>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
