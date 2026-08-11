"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store/app";
import { navigate } from "@/lib/store/router";
import type { ThemeSetting, EditorSpacing } from "@/lib/core/types";
import { formatBytes } from "@/lib/core/util";
import { archiveToText, LOCUS_EXTENSION } from "@/lib/core/serialize";
import { Button, Select } from "@/components/primitives";
import { IconShield, IconUpload } from "@/components/icons";

function Section({ title, body, children }: { title: string; body?: string; children: React.ReactNode }) {
  return (
    <section className="panel px-4 sm:px-5 py-4">
      <h2 className="text-[13.5px] font-semibold">{title}</h2>
      {body && <p className="mt-0.5 text-[12.5px] text-ink-2">{body}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SettingsView() {
  const {
    workspace, renameWorkspace, settings, setTheme, updateSettings,
    exportArchive, importArchive, resetWorkspace, storageUsage, pushNotice, confirm,
  } = useApp();
  const [wsName, setWsName] = useState(workspace?.name ?? "");
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setWsName(workspace?.name ?? "");
  }, [workspace?.name]);

  useEffect(() => {
    void storageUsage().then(setUsage);
  }, [storageUsage]);

  const commitWsName = () => {
    const v = wsName.trim();
    if (v && v !== workspace?.name) void renameWorkspace(v);
    else setWsName(workspace?.name ?? "");
  };

  const exportWorkspace = async () => {
    try {
      const archive = await exportArchive();
      const blob = new Blob([archiveToText(archive)], { type: "application/vnd.locus+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `locus-backup-${new Date().toISOString().slice(0, 10)}${LOCUS_EXTENSION}`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      pushNotice("success", "Workspace exported");
    } catch {
      pushNotice("error", "Export failed");
    }
  };

  const handleImport = async (file: File) => {
    const text = await file.text();
    const result = await importArchive(text);
    if (result.ok) {
      pushNotice("success", "Workspace restored");
      if (result.warnings.length > 0) {
        pushNotice("error", result.warnings[0]);
      }
    } else {
      pushNotice("error", result.errors[0] ?? "Import failed");
    }
  };

  const handleReset = () => {
    confirm({
      title: "Reset this workspace?",
      body: "Everything — pages, tasks, files and settings — will be erased from this device. Export a backup first if you want to keep it.",
      confirmLabel: "Erase everything",
      danger: true,
      onConfirm: () => void resetWorkspace(),
    });
  };

  const pct = usage && usage.quota > 0 ? Math.min(100, Math.round((usage.usage / usage.quota) * 100)) : 0;

  return (
    <div className="max-w-[640px] mx-auto px-4 sm:px-6 py-8">
      <header className="mb-5">
        <h1 className="font-display font-semibold tracking-tight text-[26px] leading-tight">Settings</h1>
        <p className="mt-1 text-[13px] text-ink-2">Everything is stored locally on this device.</p>
      </header>

      <div className="space-y-3">
        <Section title="Workspace" body="The name shown in the top bar and on the dashboard.">
          <input
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            onBlur={commitWsName}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="text-input w-full max-w-[320px]"
            aria-label="Workspace name"
          />
        </Section>

        <Section title="Appearance">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="text-[12px] text-ink-2 mb-1">Theme</div>
              <Select
                value={settings?.theme ?? "system"}
                onChange={(v) => void setTheme(v as ThemeSetting)}
                options={[
                  { value: "system", label: "System" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            </div>
            <div>
              <div className="text-[12px] text-ink-2 mb-1">Editor text size</div>
              <Select
                value={String(settings?.editorFontSize ?? 16)}
                onChange={(v) => void updateSettings({ editorFontSize: Number(v) })}
                options={[14, 15, 16, 17, 18].map((n) => ({ value: String(n), label: `${n}px` }))}
              />
            </div>
            <div>
              <div className="text-[12px] text-ink-2 mb-1">Editor spacing</div>
              <Select
                value={settings?.editorSpacing ?? "comfortable"}
                onChange={(v) => void updateSettings({ editorSpacing: v as EditorSpacing })}
                options={[
                  { value: "compact", label: "Compact" },
                  { value: "comfortable", label: "Comfortable" },
                ]}
              />
            </div>
          </div>
        </Section>

        <Section title="Storage" body="Files and data live in your browser's local storage.">
          {usage && usage.quota > 0 && (
            <div className="mb-3 max-w-[360px]">
              <div className="flex items-center justify-between font-mono text-[10.5px] text-ink-3 mb-1">
                <span>{formatBytes(usage.usage)} used</span>
                <span>{formatBytes(usage.quota)} available</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%` }} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void exportWorkspace()}>
              Export workspace (.locus)
            </Button>
            <Button variant="secondary" onClick={() => importRef.current?.click()}>
              <IconUpload size={13} />
              Import backup
            </Button>
          </div>
          <input
            ref={importRef}
            type="file"
            accept=".locus,application/vnd.locus+json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImport(f);
              e.target.value = "";
            }}
          />
          <p className="mt-2 text-[11.5px] text-ink-3">
            A .locus backup is a single JSON file with your whole workspace. It can be moved to another device.
          </p>
        </Section>

        <Section title="Privacy" body="Your data is private by design.">
          <p className="text-[12.5px] text-ink-2">
            Locus keeps your workspace on this device only. There is no account, no sync, and no cloud.
          </p>
          <Button variant="ghost" className="mt-2" onClick={() => navigate({ name: "privacy" })}>
            <IconShield size={13} />
            Read the privacy notes
          </Button>
        </Section>

        <Section title="Danger zone">
          <Button variant="danger" onClick={handleReset}>
            Reset workspace
          </Button>
          <p className="mt-2 text-[11.5px] text-ink-3">
            Erases every page, task, file and setting on this device. Export a backup first.
          </p>
        </Section>
      </div>
    </div>
  );
}
