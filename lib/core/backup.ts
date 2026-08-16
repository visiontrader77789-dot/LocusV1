/**
 * Automatic backup snapshots.
 *
 * Locus periodically writes a full-workspace snapshot (in the .locus archive
 * format, without file bytes) to a dedicated storage row. If the primary
 * IndexedDB rows are ever unreadable or structurally broken, the app restores
 * from the most recent snapshot instead of failing or starting empty.
 */
import type { Block, FileRef, Folder, Page, Settings, Task, Workspace } from "./types";
import { archiveToText, buildArchive, parseLocusText, type LocusArchive } from "./serialize";

export interface SnapshotInput {
  workspace: Workspace;
  settings: Settings;
  pages: Page[];
  blocks: Block[];
  tasks: Task[];
  files: FileRef[];
  folders: Folder[];
}

/**
 * Build the backup text for the current workspace. File bytes are never
 * inlined — the snapshot only records file metadata, so it stays small enough
 * to write on every autosave debounce.
 */
export async function buildSnapshot(input: SnapshotInput): Promise<string> {
  const archive = await buildArchive({
    workspace: input.workspace,
    settings: input.settings,
    pages: input.pages,
    blocks: input.blocks,
    tasks: input.tasks,
    files: input.files,
    folders: input.folders,
    blobFor: async () => null,
    inlineMaxBytes: 0,
  });
  return archiveToText(archive);
}

/**
 * Parse a snapshot back into a workspace. Returns null when the snapshot is
 * missing or invalid — never throws. An empty workspace is valid (the user may
 * have deleted all content).
 */
export function parseSnapshot(text: string): LocusArchive | null {
  const result = parseLocusText(text, { allowEmpty: true });
  return result.ok && result.data ? result.data : null;
}
