"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store/app";
import { navigate } from "@/lib/store/router";
import { Button } from "@/components/primitives";
import { LocusMark, LocusWordmark } from "@/components/mark";
import { IconCheck, IconDownload, IconUpload } from "@/components/icons";
import { LOCUS_EXTENSION } from "@/lib/core/serialize";

const WRITE_LINES = [
  "writing to local://your-device…",
  "checking storage… ok",
  "locus workspace created",
];

function LocalWriteProof() {
  const [step, setStep] = useState(0);
  const [line, setLine] = useState("");
  const [done, setDone] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced.current) {
      setLine(WRITE_LINES[WRITE_LINES.length - 1]);
      setDone(true);
      setStep(WRITE_LINES.length);
      return;
    }
    let alive = true;
    const type = (text: string, resolve: () => void) => {
      let j = 0;
      const iv = window.setInterval(() => {
        if (!alive) return;
        j += 1;
        setLine(text.slice(0, j));
        if (j >= text.length) {
          window.clearInterval(iv);
          resolve();
        }
      }, 26);
    };
    const run = async () => {
      for (let s = 0; s < WRITE_LINES.length; s += 1) {
        if (!alive) return;
        setStep(s);
        await new Promise<void>((res) => type(WRITE_LINES[s], res));
        if (!alive) return;
        await new Promise((res) => window.setTimeout(res, 280));
      }
      if (alive) setDone(true);
    };
    run();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="w-[300px] sm:w-[340px] mx-auto font-mono text-[11px] leading-[1.9] text-left rounded-[6px] border border-line bg-surface px-4 py-3 shadow-[var(--shadow-1)]">
      {WRITE_LINES.map((text, i) => {
        const isCurrent = i === step && !done;
        const isPast = i < step || done;
        return (
          <div key={text} className="flex items-start gap-2 whitespace-pre">
            <span className="text-ink-3 select-none">›</span>
            <span className={isPast ? "text-ink-2" : "text-ink"}>
              {i < step || done ? text : line}
              {isCurrent && <span className="locus-caret">▍</span>}
            </span>
            {i < step || (done && i === WRITE_LINES.length - 1) ? (
              <IconCheck size={11} className="text-accent mt-[7px] shrink-0" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function Onboarding() {
  const { createWorkspace, importArchive, pushNotice } = useApp();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    setBusy(true);
    try {
      await createWorkspace("My workspace");
      navigate({ name: "dashboard" });
    } catch {
      pushNotice("error", "Could not create a workspace on this device.");
      setBusy(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const result = await importArchive(text);
      if (result.ok) {
        navigate({ name: "dashboard" });
      } else {
        pushNotice("error", result.errors[0] ?? "This backup could not be imported.");
        setBusy(false);
      }
    } catch {
      pushNotice("error", "This backup could not be read.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="anim-rise text-center flex flex-col items-center">
          <LocusMark size={44} className="text-accent mb-6" />
          <LocusWordmark className="text-ink mb-6" />
          <h1 className="font-display text-[28px] sm:text-[34px] font-semibold tracking-tight leading-tight">
            Your personal workspace.
          </h1>
          <p className="mt-3 text-[15px] text-ink-2 max-w-[420px]">
            Everything stays on your device. No account, no cloud, no AI — just a place for your
            pages, tasks, and files that you can open any time, even offline.
          </p>

          <div className="mt-10 mb-8 anim-rise" style={{ animationDelay: "120ms" }}>
            <LocalWriteProof />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 anim-rise" style={{ animationDelay: "200ms" }}>
            <Button variant="primary" size="lg" onClick={handleCreate} disabled={busy}>
              Create Workspace
            </Button>
            <Button
              variant="secondary"
              size="lg"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <IconUpload size={15} />
              Import Workspace
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept={LOCUS_EXTENSION}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <p className="mt-8 eyebrow flex items-center gap-2">
            <IconDownload size={12} />
            keep a {LOCUS_EXTENSION} backup in Settings once you&apos;re in
          </p>
        </div>
      </div>

      <footer className="pb-6 text-center eyebrow opacity-70">
        Locus · built local-first
      </footer>
    </div>
  );
}
