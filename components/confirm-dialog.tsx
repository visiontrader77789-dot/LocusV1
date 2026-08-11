"use client";

import { useApp } from "@/lib/store/app";
import { Button } from "@/components/primitives";
import { IconAlert } from "@/components/icons";

export function ConfirmDialog() {
  const { confirmState, closeConfirm } = useApp();
  if (!confirmState) return null;
  const { title, body, confirmLabel, danger, onConfirm } = confirmState;

  const run = async () => {
    closeConfirm();
    try {
      await onConfirm();
    } catch {
      /* the store surfaces its own errors */
    }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 anim-fade">
      <div className="absolute inset-0 bg-black/35" onClick={closeConfirm} aria-hidden="true" />
      <div
        className="relative w-full max-w-[400px] bg-surface border border-line rounded-[10px] shadow-[var(--shadow-3)] p-5 anim-pop"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 shrink-0 ${danger ? "text-danger" : "text-accent"}`}>
            <IconAlert size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-[15px] tracking-tight">{title}</h2>
            {body && <p className="mt-1 text-[13px] text-ink-2 leading-relaxed">{body}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={closeConfirm}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => void run()}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
