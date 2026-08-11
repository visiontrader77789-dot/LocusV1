"use client";

import { useApp } from "@/lib/store/app";
import { IconAlert, IconCheck, IconInfo, IconX } from "@/components/icons";

export function Toasts() {
  const { notices, dismissNotice } = useApp();
  if (notices.length === 0) return null;
  return (
    <div className="fixed bottom-16 lg:bottom-5 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 w-[calc(100vw-32px)] max-w-[360px] pointer-events-none">
      {notices.map((n) => (
        <div
          key={n.id}
          className={`anim-toast pointer-events-auto w-full flex items-start gap-2.5 px-3.5 py-2.5 rounded-[6px] border shadow-[var(--shadow-2)] bg-surface text-[13px] ${
            n.kind === "error" ? "border-danger/30" : "border-line"
          }`}
          role="status"
        >
          <span className={`mt-0.5 shrink-0 ${n.kind === "error" ? "text-danger" : n.kind === "success" ? "text-accent" : "text-ink-3"}`}>
            {n.kind === "error" ? <IconAlert size={15} /> : n.kind === "success" ? <IconCheck size={15} /> : <IconInfo size={15} />}
          </span>
          <span className="flex-1 text-ink">{n.text}</span>
          <button
            type="button"
            className="icon-btn !w-5 !h-5"
            aria-label="Dismiss"
            onClick={() => dismissNotice(n.id)}
          >
            <IconX size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
