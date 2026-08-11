/**
 * Fast local search. Platform-independent.
 * Pages, tasks and files are indexed from in-memory state; page *content*
 * (blocks) is scanned lazily on demand so we never hold every block in memory.
 */
import type { Block, FileRef, ID, Page, Task } from "./types";
import { normalize, tokenize } from "./util";

export type SearchKind = "page" | "task" | "file" | "block";

export interface SearchResult {
  kind: SearchKind;
  id: ID;
  title: string;
  subtitle: string;
  /** Snippet of matching content. */
  snippet: string;
  pageId: ID | null;
  score: number;
  meta?: Record<string, unknown>;
}

export interface SearchIndex {
  query(
    q: string,
    pages: Page[],
    tasks: Task[],
    files: FileRef[],
    options?: {
      blockScan?: (() => Block[]) | null;
      limit?: number;
    },
  ): SearchResult[];
}

/** Rank helper: how strongly does `text` match the normalized query? */
function scoreText(text: string, q: string): number {
  const n = normalize(text);
  if (!n) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 70;
  if (n.includes(q)) return 45;
  const qTokens = tokenize(q);
  const nTokens = tokenize(n);
  if (qTokens.length === 0) return 0;
  const hits = qTokens.filter((t) => nTokens.includes(t)).length;
  if (hits === qTokens.length) return 25 + qTokens.length;
  if (hits > 0) return 8 + hits * 4;
  return 0;
}

function snippetAround(text: string, q: string, radius = 48): string {
  const n = normalize(text);
  const idx = n.indexOf(q);
  if (idx < 0) return text.slice(0, radius * 2) + (text.length > radius * 2 ? "…" : "");
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

export const searchIndex: SearchIndex = {
  query(q, pages, tasks, files, options = {}) {
    const query = normalize(q);
    if (!query) return [];
    const limit = options.limit ?? 12;
    const results: SearchResult[] = [];
    const blockScan = options.blockScan ?? null;

    for (const p of pages) {
      const score = scoreText(p.title, query);
      if (score > 0) {
        results.push({
          kind: "page",
          id: p.id,
          title: p.title || "Untitled",
          subtitle: p.favorite ? "Page · favorite" : "Page",
          snippet: snippetAround(p.title, query),
          pageId: p.id,
          score,
        });
      }
    }

    for (const t of tasks) {
      const titleScore = scoreText(t.title, query);
      const notesScore = t.notes ? scoreText(t.notes, query) * 0.5 : 0;
      const tagScore = t.tags.some((tag) => normalize(tag).includes(query)) ? 12 : 0;
      const score = Math.max(titleScore, notesScore, tagScore);
      if (score > 0) {
        results.push({
          kind: "task",
          id: t.id,
          title: t.title,
          subtitle: "Task",
          snippet: t.notes ? snippetAround(t.notes, query) : t.title,
          pageId: t.pageId,
          score,
          meta: { completed: t.completed },
        });
      }
    }

    for (const f of files) {
      const score = scoreText(f.name, query);
      if (score > 0) {
        results.push({
          kind: "file",
          id: f.id,
          title: f.name,
          subtitle: "File",
          snippet: f.name,
          pageId: f.pageId,
          score,
        });
      }
    }

    // Content scan is intentionally last and lazy.
    if (blockScan) {
      for (const block of blockScan()) {
        if (block.content.length === 0) continue;
        const score = scoreText(block.content, query);
        if (score > 6) {
          results.push({
            kind: "block",
            id: block.id,
            title: "Page content",
            subtitle: "Content",
            snippet: snippetAround(block.content, query),
            pageId: block.pageId,
            score: score * 0.6,
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  },
};

export interface GroupedResults {
  pages: SearchResult[];
  tasks: SearchResult[];
  files: SearchResult[];
  content: SearchResult[];
}

export function groupResults(results: SearchResult[]): GroupedResults {
  const groups: GroupedResults = { pages: [], tasks: [], files: [], content: [] };
  for (const r of results) {
    if (r.kind === "page") groups.pages.push(r);
    else if (r.kind === "task") groups.tasks.push(r);
    else if (r.kind === "file") groups.files.push(r);
    else groups.content.push(r);
  }
  return groups;
}
