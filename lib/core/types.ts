/**
 * Locus core data model.
 *
 * This module is intentionally platform-independent (no DOM, no browser APIs).
 * The same types and serialization are reused by the web app today and by the
 * future Locus Desktop / Android / iOS builds.
 */

export type ID = string;

export const SCHEMA_VERSION = 1;

export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "numberedList"
  | "todoList"
  | "quote"
  | "code"
  | "divider"
  | "image"
  | "file"
  | "table";

export interface Workspace {
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}

export interface Page {
  id: ID;
  workspaceId: ID;
  title: string;
  icon: string;
  parentId: ID | null;
  /** Sibling ordering key (drag-and-drop reorders siblings). */
  order: number;
  createdAt: number;
  updatedAt: number;
  favorite: boolean;
}

/**
 * Inline marks applied to a range of a block's plain-text `content`.
 * Offsets are UTF-16 code-unit positions (same units as `string.slice`).
 */
export interface RichMark {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Inline code. */
  code?: boolean;
  /** Link target: a page title, or an http(s) URL for external links. */
  link?: string;
}

export interface InlineSpan extends RichMark {
  /** Start offset (inclusive). */
  from: number;
  /** End offset (exclusive). */
  to: number;
}

export interface Block {
  id: ID;
  pageId: ID;
  type: BlockType;
  /**
   * Plain text content. This is always the source of truth for the text
   * (search, [[links]], export); `rich` is an optional overlay of inline
   * formatting on top of it. Edition 2.0 keeps both in sync while editing.
   */
  content: string;
  /** Optional inline formatting spans (Edition 2.0). Absent = plain text. */
  rich?: InlineSpan[];
  /** todoList only. */
  checked: boolean;
  /** image / file blocks only. */
  attachmentId: ID | null;
  /** Visual indentation depth for nested lists. */
  indent: number;
  /** table blocks only: a grid of cell texts. */
  rows: string[][];
  /** Sibling ordering within a page. */
  order: number;
  createdAt: number;
  updatedAt: number;
}

export type TaskPriority = 0 | 1 | 2 | 3; // none, low, medium, high

export interface Task {
  id: ID;
  workspaceId: ID;
  title: string;
  notes: string;
  completed: boolean;
  priority: TaskPriority;
  /** ISO date string YYYY-MM-DD or null when undated. */
  dueDate: string | null;
  /** Page this task belongs to, if any. */
  pageId: ID | null;
  tags: string[];
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export type FileKind =
  | "image"
  | "document"
  | "audio"
  | "video"
  | "archive"
  | "other";

export interface FileRef {
  id: ID;
  workspaceId: ID;
  name: string;
  size: number;
  type: string;
  kind: FileKind;
  /** Key of the Blob inside the local blob store. */
  blobKey: ID;
  /** Page this file is attached to, if any. */
  pageId: ID | null;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ThemeSetting = "light" | "dark" | "system";
export type EditorSpacing = "compact" | "comfortable";

export interface Settings {
  id: ID;
  workspaceId: ID;
  theme: ThemeSetting;
  editorFontSize: number;
  editorSpacing: EditorSpacing;
}

export interface PageTreeNode {
  page: Page;
  children: PageTreeNode[];
}

/** A record that carries both the metadata and (where feasible) the bytes of a file inside a .locus backup. */
export interface LocusFileEntry extends FileRef {
  /** base64-encoded bytes, or null when the file was too large to inline. */
  data: string | null;
}

export const WORKSPACE_ID = "main";

export function emptyWorkspace(name: string): Workspace {
  const now = Date.now();
  return {
    id: WORKSPACE_ID,
    name,
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
  };
}

export function newPage(
  workspaceId: ID,
  title: string,
  parentId: ID | null,
): Page {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    workspaceId,
    title: title || "Untitled",
    icon: "",
    parentId,
    order: now,
    createdAt: now,
    updatedAt: now,
    favorite: false,
  };
}

export function newBlock(
  pageId: ID,
  type: BlockType,
  content = "",
): Block {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    pageId,
    type,
    content,
    rich: [],
    checked: false,
    attachmentId: null,
    indent: 0,
    rows: [],
    order: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function newTask(
  workspaceId: ID,
  title: string,
  pageId: ID | null = null,
): Task {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    workspaceId,
    title,
    notes: "",
    completed: false,
    priority: 0,
    dueDate: null,
    pageId,
    tags: [],
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function newFileRef(
  workspaceId: ID,
  name: string,
  size: number,
  type: string,
  kind: FileKind,
  blobKey: ID,
): FileRef {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    workspaceId,
    name,
    size,
    type,
    kind,
    blobKey,
    pageId: null,
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function defaultSettings(workspaceId: ID): Settings {
  return {
    id: "settings",
    workspaceId,
    theme: "system",
    editorFontSize: 16,
    editorSpacing: "comfortable",
  };
}
