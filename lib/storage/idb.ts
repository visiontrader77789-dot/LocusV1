/**
 * IndexedDB-backed StorageBackend for the browser.
 * One database ("locus") with two object stores: a key-value store for rows
 * (keyed by `${table}:${id}`) and a blob store for uploaded files.
 */
import type { StorageBackend, StorageEstimate } from "./backend";

const DB_NAME = "locus";
const KV_STORE = "kv";
const BLOB_STORE = "blobs";
const DB_VERSION = 1;

type IDB = typeof indexedDB;

export class IdbBackend implements StorageBackend {
  readonly name = "idb";
  private dbPromise: Promise<IDBDatabase> | null = null;
  private unavailable = false;

  constructor(private idbFactory: IDB = indexedDB) {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = this.idbFactory.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(KV_STORE)) {
            db.createObjectStore(KV_STORE);
          }
          if (!db.objectStoreNames.contains(BLOB_STORE)) {
            db.createObjectStore(BLOB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Failed to open local database"));
      });
    }
    return this.dbPromise;
  }

  async init(): Promise<void> {
    try {
      await this.db();
    } catch {
      this.unavailable = true;
      throw new Error("Local storage is unavailable in this browser.");
    }
  }

  private get available(): boolean {
    return !this.unavailable && typeof indexedDB !== "undefined";
  }

  private requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Local database error"));
    });
  }

  private async tx(store: string, mode: IDBTransactionMode): Promise<[IDBTransaction, IDBObjectStore]> {
    const db = await this.db();
    const transaction = db.transaction(store, mode);
    return [transaction, transaction.objectStore(store)];
  }

  private async commit<T>(req: IDBRequest<T>, tx: IDBTransaction): Promise<T> {
    const result = await this.requestToPromise(req);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Local database error"));
      tx.onabort = () => reject(tx.error ?? new Error("Local database transaction aborted"));
    });
    return result;
  }

  async getAll<T>(table: string): Promise<T[]> {
    if (!this.available) return [];
    try {
      const [tx, store] = await this.tx(KV_STORE, "readonly");
      const out: T[] = [];
      const req = store.openCursor();
      await new Promise<void>((resolve, reject) => {
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const key = cursor.key as string;
            if (key.startsWith(`${table}:`)) out.push(cursor.value as T);
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => reject(req.error ?? new Error("Local database error"));
      });
      await txComplete(tx);
      return out;
    } catch {
      return [];
    }
  }

  async get<T>(table: string, key: string): Promise<T | null> {
    if (!this.available) return null;
    try {
      const [tx, store] = await this.tx(KV_STORE, "readonly");
      const value = await this.commit(store.get(`${table}:${key}`), tx);
      return (value as T | undefined) ?? null;
    } catch {
      return null;
    }
  }

  async put<T>(table: string, key: string, value: T): Promise<void> {
    if (!this.available) return;
    const [tx, store] = await this.tx(KV_STORE, "readwrite");
    await this.commit(store.put(value, `${table}:${key}`), tx);
  }

  async putAll<T>(table: string, entries: ReadonlyArray<[string, T]>): Promise<void> {
    if (!this.available || entries.length === 0) return;
    const [tx, store] = await this.tx(KV_STORE, "readwrite");
    for (const [key, value] of entries) store.put(value, `${table}:${key}`);
    await txComplete(tx);
  }

  async delete(table: string, key: string): Promise<void> {
    if (!this.available) return;
    const [tx, store] = await this.tx(KV_STORE, "readwrite");
    await this.commit(store.delete(`${table}:${key}`), tx);
  }

  async clear(table: string): Promise<void> {
    if (!this.available) return;
    const [tx, store] = await this.tx(KV_STORE, "readwrite");
    const req = store.openCursor();
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const key = cursor.key as string;
          if (key.startsWith(`${table}:`)) cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error ?? new Error("Local database error"));
    });
    await txComplete(tx);
  }

  async getBlob(key: string): Promise<Blob | null> {
    if (!this.available) return null;
    try {
      const [tx, store] = await this.tx(BLOB_STORE, "readonly");
      const value = await this.commit(store.get(key) as IDBRequest<Blob>, tx);
      return (value as Blob | undefined) ?? null;
    } catch {
      return null;
    }
  }

  async putBlob(key: string, blob: Blob): Promise<void> {
    if (!this.available) return;
    const [tx, store] = await this.tx(BLOB_STORE, "readwrite");
    await this.commit(store.put(blob, key), tx);
  }

  async deleteBlob(key: string): Promise<void> {
    if (!this.available) return;
    const [tx, store] = await this.tx(BLOB_STORE, "readwrite");
    await this.commit(store.delete(key), tx);
  }

  async getAllBlobKeys(): Promise<string[]> {
    if (!this.available) return [];
    try {
      const [tx, store] = await this.tx(BLOB_STORE, "readonly");
      const out: string[] = [];
      const req = store.openKeyCursor();
      await new Promise<void>((resolve, reject) => {
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            out.push(cursor.key as string);
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => reject(req.error ?? new Error("Local database error"));
      });
      await txComplete(tx);
      return out;
    } catch {
      return [];
    }
  }

  async clearBlobs(): Promise<void> {
    if (!this.available) return;
    const [tx, store] = await this.tx(BLOB_STORE, "readwrite");
    const req = store.openCursor();
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error ?? new Error("Local database error"));
    });
    await txComplete(tx);
  }

  async estimate(): Promise<StorageEstimate> {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      try {
        const e = await navigator.storage.estimate();
        return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
      } catch {
        /* fall through */
      }
    }
    return { usage: 0, quota: 0 };
  }
}

function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Local database error"));
    tx.onabort = () => reject(tx.error ?? new Error("Local database transaction aborted"));
  });
}

export function isStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined" && typeof navigator !== "undefined";
}
