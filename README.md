# Locus

**A private, local-first workspace. No account, no cloud, no AI — everything you create stays on your device.**

Locus is a single-page web app that runs entirely in your browser. It combines a block-based editor, pages and folders, tasks, files, a customizable dashboard of widgets, and a command palette — all stored only in your browser's own storage (IndexedDB). There is no backend, no sign-in, no telemetry, and no network calls.

## Core features

- **Block editor** — paragraphs, headings, to-do lists, bullet and numbered lists, quotes, callouts, toggles, code blocks, math (LaTeX), tables, dividers, images, file attachments, links, page links, dates, times, and highlights — all inserted from a `/` slash menu.
- **Pages & folders** — nested pages, page icons, cover images, and favorites.
- **Tasks** — priorities, due dates, tags, check-off from dashboard widgets, and a dedicated Tasks view.
- **Files** — upload and download files stored in your own browser storage.
- **Dashboard widgets** — clock, calendar, pomodoro timer, quick note, today's tasks, favorites, recent pages, countdown, sticky note, focus quote, quick actions, and productivity stats. Add, remove, and resize them.
- **Command palette** — search pages, blocks, tasks, files, and folders from anywhere (`Cmd/Ctrl-K`).
- **Keyboard shortcuts** — a full shortcut system, viewable in-app and remappable in Settings.
- **Themes** — light and dark, following your system preference by default.
- **Backup & restore** — export your workspace to a single `.locus` file (Settings → Export) or import it back. The file can be stored anywhere you like.
- **Privacy-first** — the app is served as static files with no backend, so there is nothing to track you. See [SECURITY.md](SECURITY.md).

## Tech stack

- [Next.js](https://nextjs.org) 15 (App Router, static export)
- [React](https://react.dev) 19
- [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS](https://tailwindcss.com) v4
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) for all local storage
- [KaTeX](https://katex.org) for math rendering
- [Vitest](https://vitest.dev) for unit tests

## Getting started

```bash
# 1. Install dependencies
npm install

# 2a. Development server
npm run dev
# Open http://localhost:3000 (or the URL shown in the terminal)

# 2b. Or build the static export and serve it
npm run build
npx serve out -s -l 3000
# Open http://127.0.0.1:3000
```

The production `npm run build` creates a fully static site in `out/` (`output: "export"` — no Node server required). Serve that folder with any static file server.

## Project scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Create the static export in `out/` |
| `npm test` | Run the unit test suite (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type-check the codebase (`tsc --noEmit`) |
| `npm run lint` | Lint the codebase (ESLint) |
| `npm start` | Run `next start` (not for a static export) |

## Privacy & data

- No accounts, no sign-in, no telemetry, no analytics.
- All data lives in your browser's IndexedDB storage for this site.
- Nothing leaves your device except the files you explicitly export or download.
- Clearing your browser data for this site removes the workspace — keep a `.locus` backup if that matters.
- See [SECURITY.md](SECURITY.md) for the security model and [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute.

## Project structure

```
app/        Next.js App Router entry (layout, root page, global styles)
components/ UI components (editor, sidebar, dashboard widgets, views)
lib/core/   Pure data logic — types, serialization, validation, tree ops, search
lib/storage/ Storage backend: IndexedDB, in-memory fallback, typed repositories
lib/store/  React state store, event bus, router
lib/shortcuts/ Keyboard shortcuts registry, handler, and overrides
public/     Static assets (icon, web manifest)
```

The storage architecture is documented in [STORAGE-ENGINEERING-REPORT.md](STORAGE-ENGINEERING-REPORT.md).

## License

_License to be determined by the maintainer. Not licensed for redistribution yet. See the repository owner for details._