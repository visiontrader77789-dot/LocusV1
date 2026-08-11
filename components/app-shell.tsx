"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store/app";
import { navigate, type Route } from "@/lib/store/router";
import { onSidebarOpen, openPalette } from "@/lib/store/events";
import { Topbar } from "@/components/topbar";
import { Sidebar } from "@/components/sidebar";
import { Dashboard } from "@/components/dashboard";
import { PageView } from "@/components/page-view";
import { TasksView } from "@/components/tasks-view";
import { FilesView } from "@/components/files-view";
import { FavoritesView } from "@/components/favorites-view";
import { SettingsView } from "@/components/settings-view";
import { PrivacyView } from "@/components/privacy-view";
import { IconFiles, IconHome, IconPlus, IconSettings, IconTasks } from "@/components/icons";

function MobileNav({ route }: { route: Route }) {
  const { createPage } = useApp();
  const items = [
    { key: "home", label: "Home", icon: IconHome, go: () => navigate({ name: "dashboard" }) },
    { key: "tasks", label: "Tasks", icon: IconTasks, go: () => navigate({ name: "tasks" }) },
    { key: "files", label: "Files", icon: IconFiles, go: () => navigate({ name: "files" }) },
    { key: "settings", label: "Settings", icon: IconSettings, go: () => navigate({ name: "settings" }) },
  ];
  return (
    <nav className="lg:hidden shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch h-[52px]">
        <button
          type="button"
          aria-label="New page"
          className="flex flex-col items-center justify-center gap-0.5 flex-1 text-accent"
          onClick={() => void createPage(null).then((p) => navigate({ name: "page", id: p.id }))}
        >
          <IconPlus size={18} />
          <span className="text-[9.5px] font-medium">New</span>
        </button>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.go}
            aria-label={item.label}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 ${
              route.name === item.key ? "text-accent" : "text-ink-3"
            }`}
          >
            <item.icon size={18} />
            <span className="text-[9.5px] font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function MobileDrawer({ route, onClose }: { route: Route; onClose: () => void }) {
  return (
    <div className="lg:hidden fixed inset-0 z-40 anim-fade">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-y-0 left-0 w-[280px] bg-surface shadow-[var(--shadow-3)] anim-rise overflow-y-auto">
        <Sidebar route={route} onNavigate={onClose} />
      </div>
    </div>
  );
}

function View({ route }: { route: Route }) {
  switch (route.name) {
    case "page":
      return <PageView key={route.id} pageId={route.id} />;
    case "folder":
      return <FilesView key={route.id} folderId={route.id} />;
    case "tasks":
      return <TasksView />;
    case "files":
      return <FilesView />;
    case "favorites":
      return <FavoritesView />;
    case "settings":
      return <SettingsView />;
    case "privacy":
      return <PrivacyView />;
    default:
      return <Dashboard />;
  }
}

export function AppShell({ route }: { route: Route }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => onSidebarOpen(() => setDrawerOpen(true)), []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [route]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-paper">
      <Topbar route={route} />
      <div className="flex flex-1 min-h-0">
        <div className="hidden lg:flex">
          <Sidebar route={route} />
        </div>
        <main className="flex-1 min-w-0 overflow-y-auto" id="locus-scroll">
          <View route={route} />
        </main>
      </div>
      <MobileNav route={route} />
      {drawerOpen && <MobileDrawer route={route} onClose={() => setDrawerOpen(false)} />}
    </div>
  );
}
