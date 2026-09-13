# Security Policy

## Privacy model

Locus is designed to be private **by construction**:

- **No backend.** The published app is a set of static files (Next.js `output: "export"`). There is no server to receive requests, no API, and no database outside the browser.
- **No network requests.** The app never contacts a remote endpoint. Fonts and libraries are bundled with the build; even the KaTeX math-rendering assets ship as static files.
- **No accounts, no telemetry, no analytics.** Your identity is irrelevant to the app because nothing is ever sent anywhere.
- **Local-only storage.** Your workspace (pages, tasks, files, settings) is written to the browser's [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) through a thin typed layer (`lib/storage/`). Nothing leaves the device unless **you** explicitly use *Settings → Export workspace* or *download a file* from the Files page.

Because data stays in the browser, privacy also includes **availability**:

- Clearing your browser site data removes the workspace. Keep a `.locus` backup export if that matters to you.
- Workspaces are tied to a single browser profile and device; they do not roam.

## Reporting a vulnerability

If you find a security issue — anything that could leak data, lose data, or otherwise behave unexpectedly for a user — please report it privately rather than opening a public issue.

- Email the maintainer (address will be added here once the repository is published).
- Include: the app version or commit hash, browser and platform, steps to reproduce, and the impact you observed.
- Do not share the details publicly until the maintainer has had a reasonable window to assess and fix it.
- If you can, verify your findings against a fresh profile with an empty IndexedDB so the report is not affected by a corrupted local database.

## Scope

The threat that Locus cares most about is unintended exfiltration or loss of the user's own data. Third-party code is pinned in `package-lock.json` and only the packages listed in `package.json` are installed; any change to that set should be reviewed on purpose, not by accident.

## Security hardening notes (from the Storage 2.0 work)

- Every workspace save goes through a single `commit()` path and is written atomically.
- Loads are validated and migrated before use; malformed rows are reconciled instead of crashing.
- Workspace export/import, backups, and file blobs are integrity-checked (`lib/core/validate.ts`, `lib/core/serialize.ts`).
- Cross-tab coordination prevents concurrent-writer races (`lib/store/app.tsx`).