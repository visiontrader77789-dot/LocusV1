"use client";

import { useApp } from "@/lib/store/app";
import { LocusMark } from "@/components/mark";
import { IconDatabase, IconExternal, IconShield, IconWifiOff } from "@/components/icons";

const SECTIONS = [
  {
    icon: <IconShield size={16} />,
    title: "No account, no tracking",
    body: "Locus has no accounts and no sign-in. There is no telemetry, no analytics, and no way for us to see what you write. The app never makes a network request to any server.",
  },
  {
    icon: <IconWifiOff size={16} />,
    title: "Everything stays on your device",
    body: "Pages, tasks, files and settings are written to your browser's local storage. Close the tab, reboot, go offline — your workspace is still here. Even the app itself is served as static files with no backend.",
  },
  {
    icon: <IconDatabase size={16} />,
    title: "Backup is your choice",
    body: "Settings → Export workspace writes a single .locus file you can keep anywhere, and Import restores it. That's the only way data moves off your device, and only when you do it.",
  },
  {
    icon: <IconExternal size={16} />,
    title: "What leaves this device",
    body: "Only two things, and only at your command: the file you deliberately export, and the files you deliberately download from the Files page. Nothing else.",
  },
];

export function PrivacyView() {
  const { workspace } = useApp();

  return (
    <div className="max-w-[640px] mx-auto px-4 sm:px-6 py-8">
      <header className="mb-6 flex items-start gap-3">
        <span className="mt-1 text-accent"><LocusMark size={26} /></span>
        <div>
          <h1 className="font-display font-semibold tracking-tight text-[26px] leading-tight">
            Locus is local by design
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {workspace ? `Your workspace “${workspace.name}” lives in this browser.` : "A workspace that lives in this browser."}
          </p>
        </div>
      </header>

      <div className="space-y-3">
        {SECTIONS.map((s) => (
          <section key={s.title} className="panel px-4 sm:px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 shrink-0 flex items-center justify-center rounded-[6px] bg-accent-soft text-accent">
                {s.icon}
              </span>
              <h2 className="text-[13.5px] font-semibold">{s.title}</h2>
            </div>
            <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">{s.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-6 rounded-[8px] border border-dashed border-line-strong px-4 py-3.5">
        <p className="text-[12.5px] text-ink-2 leading-relaxed">
          A note on “offline”: Locus stores data in your browser's storage, which is tied to this browser and device.
          Clearing site data or switching browsers removes access — keep a .locus backup exported if that matters to you.
        </p>
      </div>
    </div>
  );
}
