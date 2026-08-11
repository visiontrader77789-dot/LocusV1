"use client";

/**
 * Hash router. The whole app is a static-exportable client app; navigation
 * lives in the URL hash so back/forward, deep links and offline reload all work.
 */

export type Route =
  | { name: "dashboard" }
  | { name: "page"; id: string }
  | { name: "tasks" }
  | { name: "files" }
  | { name: "favorites" }
  | { name: "settings" }
  | { name: "privacy" };

export function parseHash(hash?: string): Route {
  // SSR-safe: on the server there is no window, so an empty hash is assumed.
  // On the client, callers omit `hash` to read window.location.hash.
  const h = (hash ?? (typeof window !== "undefined" ? window.location.hash : "")).replace(/^#\/?/, "");
  if (!h) return { name: "dashboard" };
  if (h.startsWith("p/")) {
    const id = decodeURIComponent(h.slice(2));
    if (id) return { name: "page", id };
    return { name: "dashboard" };
  }
  switch (h) {
    case "tasks": return { name: "tasks" };
    case "files": return { name: "files" };
    case "favorites": return { name: "favorites" };
    case "settings": return { name: "settings" };
    case "privacy": return { name: "privacy" };
    default: return { name: "dashboard" };
  }
}

export function toHash(route: Route): string {
  switch (route.name) {
    case "page": return `#/p/${encodeURIComponent(route.id)}`;
    case "tasks": return "#/tasks";
    case "files": return "#/files";
    case "favorites": return "#/favorites";
    case "settings": return "#/settings";
    case "privacy": return "#/privacy";
    default: return "#/";
  }
}

export function navigate(route: Route): void {
  if (typeof window === "undefined") return;
  const hash = toHash(route);
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  }
}
