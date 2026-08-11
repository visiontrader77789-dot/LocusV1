"use client";

import { LocusMark, LocusWordmark } from "@/components/mark";

export function Splash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-paper">
      <div className="anim-pop">
        <LocusMark size={40} className="text-accent" />
      </div>
      <LocusWordmark className="text-ink-2" />
      <p className="eyebrow mt-1">opening your workspace</p>
    </div>
  );
}
