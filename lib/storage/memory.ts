/**
 * In-memory StorageBackend. Used by tests and during SSR/hydration safety.
 */
import type { StorageBackend, StorageEstimate, TransactOp } from "./backend";

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

  async transact(ops: readonly TransactOp[]): Promise<void> {
    if (ops.length === 0) return;
    const kvSnapshot = new Map(this.kv);
    const blobsSnapshot = new Map(this.blobs);
    try {
      for (const op of ops) {
        switch (op.op) {
          case "put":
            this.kv.set(MemoryBackend.key(op.table, op.key), op.value);
            break;
          case "delete":
            this.kv.delete(MemoryBackend.key(op.table, op.key));
            break;
          case "putBlob":
            this.blobs.set(op.key, op.blob);
            break;
          case "deleteBlob":
            this.blobs.delete(op.key);
            break;
          case "clearTable": {
            const prefix = `${op.table}:`;
            for (const k of [...this.kv.keys()]) {
              if (k.startsWith(prefix)) this.kv.delete(k);
            }
            break;
          }
          case "clearBlobs":
            this.blobs.clear();
            break;
        }
      }
    } catch (e) {
      this.kv = kvSnapshot;
      this.blobs = blobsSnapshot;
      throw e;
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

  async getAllBlobKeys(): Promise<string[]> {
    return [...this.blobs.keys()];
  }

  async clearBlobs(): Promise<void> {
    this.blobs.clear();
  }

  async estimate(): Promise<StorageEstimate> {
    let usage = 0;
    for (const blob of this.blobs.values()) usage += blob.size;
    return { usage, quota: 0 };
  }
}
