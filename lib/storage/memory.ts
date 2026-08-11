/**
 * In-memory StorageBackend. Used by tests and during SSR/hydration safety.
 */
import type { StorageBackend, StorageEstimate } from "./backend";

export class MemoryBackend implements StorageBackend {
  readonly name = "memory";
  private kv = new Map<string, unknown>();
  private blobs = new Map<string, Blob>();

  private static key(table: string, key: string): string {
    return `${table}:${key}`;
  }

  async init(): Promise<void> {}

  async getAll<T>(table: string): Promise<T[]> {
    const prefix = `${table}:`;
    const out: T[] = [];
    for (const [k, v] of this.kv) {
      if (k.startsWith(prefix)) out.push(v as T);
    }
    return out;
  }

  async get<T>(table: string, key: string): Promise<T | null> {
    return (this.kv.get(MemoryBackend.key(table, key)) as T | undefined) ?? null;
  }

  async put<T>(table: string, key: string, value: T): Promise<void> {
    this.kv.set(MemoryBackend.key(table, key), value);
  }

  async putAll<T>(table: string, entries: ReadonlyArray<[string, T]>): Promise<void> {
    for (const [key, value] of entries) {
      this.kv.set(MemoryBackend.key(table, key), value);
    }
  }

  async delete(table: string, key: string): Promise<void> {
    this.kv.delete(MemoryBackend.key(table, key));
  }

  async clear(table: string): Promise<void> {
    const prefix = `${table}:`;
    for (const k of [...this.kv.keys()]) {
      if (k.startsWith(prefix)) this.kv.delete(k);
    }
  }

  async getBlob(key: string): Promise<Blob | null> {
    return this.blobs.get(key) ?? null;
  }

  async putBlob(key: string, blob: Blob): Promise<void> {
    this.blobs.set(key, blob);
  }

  async deleteBlob(key: string): Promise<void> {
    this.blobs.delete(key);
  }

  async estimate(): Promise<StorageEstimate> {
    let usage = 0;
    for (const blob of this.blobs.values()) usage += blob.size;
    return { usage, quota: 0 };
  }
}
