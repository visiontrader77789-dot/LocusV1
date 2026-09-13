# LOCUS — Storage System 2.0 Engineering Report

Scope: hardening the local-only storage layer of Locus. All work is client-side
and stays local-first: no accounts, no cloud, no AI, no backend.

---

## 1. Current architecture

Locus is a Next.js (App Router, static export) single-page application that keeps
the entire workspace in the browser. The storage layer is a thin abstraction over
IndexedDB:

- `lib/storage/backend.ts` — `StorageBackend` interface: `get/getAll/put/putAll/
  delete/clear` for row data, `getBlob/putBlob/deleteBlob/getAllBlobKeys/clearBlobs`
  for file bytes, `transact()` for atomic multi-store writes, and `estimate()` for
  quota. Also defines the `TransactOp` union.
- `lib/storage/idb.ts` — `IdbBackend`. One database `locus` (version 1) with two
  object stores: `kv` (rows keyed `"<table>:<id>"`) and `blobs` (file bytes).
- `lib/storage/memory.ts` — `MemoryBackend`, an in-memory double used by unit tests
  and by the app as a fallback when IndexedDB is unavailable.
- `lib/storage/stores.ts` — `Repository`, a typed facade: workspace/settings/pages/
  blocks/tasks/files/folders row stores, snapshot rows, `replaceWorkspace` (atomic
  full replacement), `clearWorkspace` (atomic reset).
- `lib/store/app.tsx` — the React store. Owns the load pipeline, the central
  `commit()` save path, cross-tab coordination, backup scheduling, and exposes all
  mutators to the UI.

Entity model: one workspace → pages (nested via `parentId`, optional `folderId`),
blocks (owning page), tasks, files (metadata in `kv`, bytes in `blobs`), folders
(nested via `parentId`), and a single settings row. Everything is keyed by a
`<table>:<id>` string in the `kv` store.

Row layout in the `kv` store:

| Table        | Key                       | Notes                                  |
|--------------|---------------------------|----------------------------------------|
| workspace    | `ws:main`                 | one row per workspace                  |
| settings     | `settings:settings`       | one row                                |
| pages        | `pages:<pageId>`          |                                        |
| blocks       | `blocks:<blockId>`        |                                        |
| tasks        | `tasks:<taskId>`          |                                        |
| files        | `files:<fileId>`          | metadata; bytes live in `blobs`       |
| folders      | `folders:<folderId>`      |                                        |
| backup       | `ws:snapshot`             | full-workspace backup snapshot (v2)    |

## 2. Problems found

Audit of the pre-2.0 storage layer found seven concrete gaps, plus one critical
latent bug surfaced during E2E verification:

1. **Save-state lied.** Mutators caught persistence errors, kept the optimistic
   in-memory state, but still flashed "All changes saved". Users were told data was
   saved when it wasn't.
2. **No write path could retry.** After a failed save the UI simply moved on; the
   in-memory change was never re-persisted, so it vanished on reload.
3. **No backup existed.** If the primary rows were lost or unreadable, the workspace
   was gone. `.locus` exports are manual.
4. **Imports were not atomic.** Import cleared every table *before* writing, so a
   failed import left the user with an empty workspace and no recovery.
5. **Untrusted data was trusted.** Rows were loaded and rendered as-is; a corrupt or
   hand-edited row could crash rendering or poison the tree.
6. **No cross-tab coordination.** Two open tabs could silently overwrite each
   other's work with last-writer-wins and no signal to the user.
7. **Silent read failures.** `IdbBackend.get/getAll` swallowed storage errors and
   returned empty results, making corruption look like "an empty workspace".
8. **Critical (found in E2E): IndexedDB cursor race in `transact()`.**
   `clearTable` used a cursor to delete prefix-matching keys in the same transaction
   that later queued `put` writes. Cursor iteration callbacks interleave with other
   queued requests nondeterministically; the deletes for some tables landed *after*
   the puts and erased the just-written rows. The workspace row (`ws:main`),
   settings, and tasks were silently dropped while pages/blocks survived — every
   fresh workspace launch subsequently went through backup recovery instead of the
   primary path. Fixed by replacing the cursor with a single prefix key-range
   delete (`IDBKeyRange.bound(prefix, prefix + "\uffff")`), which is ordered
   deterministically in the transaction.

## 3. Changes implemented

- **`lib/core/validate.ts` (new)** — sanitizing validators for every entity
  (`validateWorkspaceMeta`, `validateSettings`, `validatePage`, `validateFolder`,
  `validateBlock`, `validateTask`, `validateFile`), plus `dedupeById`,
  `repairRelationships` (re-keys duplicate ids, breaks page/folder parent cycles,
  detaches orphan references), and `resolveFolderId`. Shared by import/export and
  the normal load path.
- **`lib/core/load.ts` (new)** — `sanitizeLoadedData`: validates and repairs a full
  workspace in one pass, strips file payload bytes from refs, drops orphan blocks
  referencing unknown pages, returns `{ data, issues }`.
- **`lib/core/backup.ts` (new)** — `buildSnapshot` / `parseSnapshot`: serialize and
  parse a full-workspace snapshot row reusing the `.locus` archive format (no file
  bytes — metadata only).
- **`lib/core/serialize.ts` (refactored)** — now imports the shared validators from
  `validate.ts`; imports run `repairRelationships` + `dedupeById`; `parseLocusText`
  gained an `allowEmpty` option so automatic snapshots of an intentionally emptied
  workspace stay restorable (interactive imports still reject "empty backup").
- **`lib/core/migration.ts` (hardened)** — `migrateWorkspace` coerces a malformed
  `schemaVersion` (string/NaN/missing → number, floor to ≥1) instead of trusting it.
- **`lib/storage/backend.ts`** — added the `TransactOp` union + `transact(ops)`
  contract; documented that `get/getAll` must distinguish "no data" from "read
  error".
- **`lib/storage/idb.ts`** — implemented `transact` (single readwrite transaction
  over `kv` + `blobs`); `get/getAll` now reject on storage errors (no more silent
  empties); **fixed the cursor/put race** in `clearTable` (and the standalone
  `clear`) with prefix key-range deletes.
- **`lib/storage/memory.ts`** — implemented `transact` with a map snapshot +
  rollback if any op throws, mirroring atomicity for tests.
- **`lib/storage/stores.ts`** — `replaceWorkspace(bundle)` (atomic full
  replacement: clear all tables + blobs, then write rows, in one transaction —
  nothing is pre-cleared, so the old workspace survives a failed import),
  `clearWorkspace` (atomic reset), `getSnapshot`/`saveSnapshot` (`ws:snapshot`).
- **`lib/store/app.tsx`** — the storage provider rewrite:
  - Load pipeline: validate → repair → dedupe → resolve folder ids → migrate;
    repairs surface as a notice ("Some saved data needed repair on load.").
  - Snapshot fallback on primary failure: unreadable rows **or** a missing
    workspace row with a snapshot present → restore from `ws:snapshot`, show
    "Recovered from the last backup snapshot.", and rebuild the primary rows
    non-destructively.
  - Central `commit(entities, write)` returning success/failure: sets accurate
    save-state (`saving`/`saved`/`error`/`idle`), clears dirty-entity markers on
    success, keeps memory state + shows an error notice on failure (the next change
    retries), posts cross-tab notifications, and schedules the backup snapshot.
  - Cross-tab `BroadcastChannel("locus:sync")`: reconcile clean entities by
    re-reading them from storage; warn (but keep local data) when the remote save
    touches an entity this tab has locally modified.
  - Debounced snapshot (`SNAPSHOT_DEBOUNCE_MS = 2000`) after saves, plus
    `pagehide`/`visibilitychange(hidden)` writes.
  - Atomic import / reset / createWorkspace (all through `replaceWorkspace` /
    `clearWorkspace`).
- **Tests** — new `validate.test.ts`, `load.test.ts`, `backup.test.ts`,
  `stores.test.ts`; extended `migration.test.ts`.

## 4. Technologies

- Next.js 15.5 (App Router) + React 19, static export.
- IndexedDB (native, no wrapper library), single `locus` database.
- TypeScript 5.9, strict typing throughout.
- Tailwind CSS 4 for UI.
- Vitest 4 for unit tests.
- Playwright (Python) driven by the `webapp-testing` skill harness for browser E2E.
- No new runtime dependencies were added (per constraints).

## 5. Schema version

- Application schema version: `SCHEMA_VERSION = 2` (stored per workspace row,
  exported in `.locus` files). `schemaVersion` is written into the workspace meta
  and validated/coerced on load.
- IndexedDB schema version: `DB_VERSION = 1` (unchanged). The `kv` + `blobs` store
  layout is stable; rows are versioned through the app-level `schemaVersion`, not
  the DB version.

## 6. Migration system

- `migrateWorkspace(raw, current)` runs at the end of the load pipeline and the
  import path. It steps through versions below the current `SCHEMA_VERSION`.
- Hardened so a missing/NaN/string `schemaVersion` cannot break the chain: it is
  coerced to a number, floored to at least 1, and the migration walks forward from
  the resulting value.
- Migration failures do not delete data; the row is sanitized and left for the
  next write.

## 7. Save strategy

- Every mutation flows through `commit(entities, write)`:
  1. `setSave("saving")`; awaits the persistence write.
  2. On success: clears dirty markers for the written entities, sets `saved`
     (auto-returns to `idle` after 2.4s), posts a cross-tab "saved" message.
  3. On failure: sets `error`, keeps the in-memory state, pushes the notice
     "Could not save — your data is still in this tab. Export a backup if this
     keeps happening." The data is preserved in the tab and the next mutation
     retries persistence.
- A pending-writes counter keeps the indicator truthful when several mutations
  overlap.
- Entities are tracked dirty in a ref set (`markDirty`) so failed writes keep the
  entity marked and cross-tab messages know which entities are locally modified.
- No "saved" claim is ever shown after a failed write.

## 8. Backup / recovery

- Every commit (and pagehide/visibility-hidden) schedules a **snapshot** of the
  whole workspace into the `ws:snapshot` kv row, reusing the `.locus` archive
  format with zero file bytes (file metadata only). Debounced at 2s so typing
  doesn't thrash the write; the `pagehide` hook covers closing the tab.
- On startup the pipeline loads primary rows first. It falls back to the snapshot
  when:
  - a primary read **throws** (storage error), or
  - the **workspace row is missing but a snapshot exists** (data was lost).
- Recovery is non-destructive: after restoring from the snapshot, the primary rows
  are re-written from memory so the next launch loads normally. A notice tells the
  user "Recovered from the last backup snapshot."
- `parseSnapshot` never throws; an empty workspace snapshot is valid (the user may
  have deleted everything).

## 9. File storage

- Uploaded files are stored as raw `Blob` objects in the `blobs` store, keyed by a
  generated `blobKey`; the `files` row in `kv` holds metadata (`name`, `size`,
  `type`, `kind`, `blobKey`, `folderId`).
- On add, the blob is written first; only on success is the metadata row created —
  a failed blob write leaves no dangling reference.
- `.locus` exports/backups embed small file bytes (base64) and store large files by
  metadata-only reference.
- Atomic `replaceWorkspace` clears and rewrites blobs together with rows in the same
  transaction.

## 10. Corruption handling

- All data loaded from storage is treated as untrusted and passes through the
  sanitizing validators (`lib/core/validate.ts`). Invalid/missing fields are
  defaulted, not discarded.
- Structural problems are repaired, never silently deleted:
  - duplicate ids → re-keyed to new unique ids;
  - page/folder parent cycles → broken so every member becomes a root;
  - orphan `parentId`/`folderId` → detached;
  - blocks referencing unknown pages → excluded from the loaded set.
- If any repair happened, the user sees "Some saved data needed repair on load."
- If rows are unreadable, the snapshot recovery path (Section 8) kicks in instead
  of showing a broken or empty workspace.

## 11. Quota / failure handling

- The save-state indicator is truthful end-to-end (Section 7): failures show
  `error`, never `saved`.
- On a quota-exceeded write (e.g. an over-large file), `addFiles` shows a specific
  notice (`"<name>" is too large to store locally.`) and skips the file.
- `storageUsage` exposes `navigator.storage.estimate()` usage/quota to Settings.
- A fully unavailable IndexedDB is surfaced as a fatal error screen
  ("Local storage is unavailable."), not a silent empty workspace.
- Read errors now propagate (instead of returning empty arrays) so they can be
  distinguished from genuine "no data" states and routed to snapshot recovery.

## 12. Cross-tab handling

- Tabs coordinate over `BroadcastChannel("locus:sync")`. After a save, the writing
  tab posts `{ type: "saved", sender: <tabId>, entities: [...] }`; the sender id
  prevents echo handling.
- Receiving tabs reconcile **clean** entities (re-read from storage) so the sidebar,
  lists, and editors reflect the other tab's changes without a reload.
- Entities **dirty in the receiving tab** are left alone and the user is warned:
  "Another tab changed your workspace — your unsaved edits may overwrite those
  changes."
- The E2E suite verifies a title edited in tab A appears in tab B's sidebar with no
  reload and no console errors.

## 13. Tests performed

Unit tests (Vitest, `npm run test`): **80 tests across 9 files, all passing.**

- `validate.test.ts` (11) — validators, dedupe, page/folder cycle breaking, orphan
  detachment.
- `load.test.ts` (8) — full sanitize pipeline, schema migration, repair issues.
- `migration.test.ts` (10) — step migrations incl. malformed `schemaVersion`.
- `serialize.test.ts` (3) — export/import round-trip; empty-backup rejection.
- `backup.test.ts` (3) — snapshot build/parse, empty workspace restore.
- `stores.test.ts` (6) — Repository over MemoryBackend: atomic `replaceWorkspace`,
  `clearWorkspace`, snapshot rows, and rollback-on-failure via a throwing map
  double (the failed import leaves the previous workspace intact).
- `tree.test.ts` (10), `rich.test.ts` (23), `widgets.test.ts` (6) — pre-existing.

Browser E2E (Playwright via the `webapp-testing` harness): **19 checks, all passing,
0 JS errors** (`qa_storage.py`):

1. Snapshot row exists after editing.
2. Snapshot is a valid locus archive.
3. Workspace row exists (regression test for the cursor-race bug).
4. Content persists after reload.
5–7. Corruption setup (workspace + page rows deleted).
8. Recovery notice shown after corruption.
9. Content recovered from the snapshot.
10. Workspace row rebuilt from memory.
11. Cross-tab reconcile: title set in tab A appears in tab B without reload.
12. No error indicator in the writing tab after a successful save.
13–14. Repair-on-load: orphaned `parentId` rows → repair notice, content intact.
15–19. Atomic import: onboarding import of a `.locus` file → success notice,
   imported rows present, seed rows fully replaced, workspace row present.

Production smoke (served static build): onboarding renders; workspace + snapshot
rows persist; content persists after reload. 0 JS errors.

## 14. Build / lint / typecheck results

- `npm run build` (Next.js production build, static export): **compiles clean**,
  static pages 4/4, exported 2/2. Route bundle 151 kB, first-load JS 254 kB.
- `npx tsc --noEmit`: **clean** (no errors).
- `npm run lint` (ESLint, next + typescript configs): **0 errors, 14 warnings** —
  all warnings are pre-existing (unused destructured props in sidebar, one
  exhaustive-deps note in block editor) and untouched by this work.

## 15. Remaining limitations

- The snapshot is a single point of backup. Its write is best-effort; if it also
  fails (e.g. full disk), the recovery path is unavailable.
- `BroadcastChannel` reconciliation is entity-granular, not conflict-aware: two
  tabs editing the *same* page can still last-writer-win, though the warning notice
  surfaces the situation.
- Snapshot restore rebuilds primary rows non-destructively but does not re-run the
  repair/validation story on files whose bytes were metadata-only in the snapshot.
- Unit tests exercise atomicity via `MemoryBackend`; the IndexedDB transaction
  semantics are covered by the browser E2E (which caught the cursor-race bug).
- No automated coverage of quota-exhaustion in a real browser (hard to induce
  reliably); the failure paths are covered by unit-level doubles and code review.

## 16. Later-address issues (not in scope)

- Versioned snapshot rotation (keep N backups) to guard against a bad write
  overwriting a good backup.
- Real conflict resolution (merge/rebase) for concurrent page edits across tabs.
- Full offline/CRDT-style change log for future sync if the local-first boundary is
  ever relaxed.
- Web Locks API to serialize cross-tab writes instead of reconcile-after-the-fact.
- Migration of `.locus` snapshots written before `schemaVersion` was introduced.
- Pre-existing (documented, not fixed): unused destructured props in
  `components/sidebar.tsx`, unused `MenuLabel` import in `components/files-view.tsx`,
  and the `block.tsx` effect dependency note.
