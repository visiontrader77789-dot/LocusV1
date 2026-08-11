"use client";

import { useEffect, useState } from "react";
import { AppProvider, useApp } from "@/lib/store/app";
import { parseHash, type Route } from "@/lib/store/router";
import { Splash } from "@/components/splash";
import { Onboarding } from "@/components/onboarding";
import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";
import { Toasts } from "@/components/toasts";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LocusMark } from "@/components/mark";

function App() {
  const { ready, fatalError, workspace } = useApp();
  const [route, setRoute] = useState<Route>({ name: "dashboard" });

  useEffect(() => {
    setRoute(parseHash());
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (!ready) return <Splash />;

  if (fatalError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <LocusMark size={36} className="text-accent" />
        <h1 className="font-display text-lg font-semibold">Locus can&apos;t store anything here</h1>
        <p className="text-sm text-ink-2 max-w-sm">
          {fatalError} Locus needs local storage to keep your workspace. Try a different browser or
          re-enable site storage.
        </p>
      </div>
    );
  }

  if (!workspace) return <Onboarding />;

  return (
    <>
      <AppShell route={route} />
      <CommandPalette />
      <Toasts />
      <ConfirmDialog />
    </>
  );
}

export default function Root() {
  return (
    <AppProvider>
      <App />
    </AppProvider>
  );
}
