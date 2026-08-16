/**
 * Storage backend interface.
 *
 * The React app never talks to IndexedDB directly. Everything goes through
 * this interface, so the web storage can be swapped for a native database in
 * the future Locus Desktop / Android / iOS builds, or for an in-memory backend
 * in tests.
 *
 * Read methods (`get`, `getAll`) reject on storage errors — they must never
 * swallow a failure into "empty" — so the load pipeline can distinguish "no
 * data yet" from "data exists but could not be read".
 */

export interface StorageEstimate {
  usage: number;
  quota: number;
}

/** A single atomic write unit spanning row stores and the blob store. */
export type TransactOp =
  | { op: "put"; table: string; key: string; value: unknown }
  | { op: "delete"; table: string; key: string }
  | { op: "putBlob"; key: string; blob: Blob }
  | { op: "deleteBlob"; key: string }
  | { op: "clearTable"; table: string }
  | { op: "clearBlobs" };

export interface StorageBackend {
  readonly name: string;
  init(): Promise<void>;

  /** Row stores. Keys are `${table}:${id}` internally. */
  getAll<T>(table: string): Promise<T[]>;
  get<T>(table: string, key: string): Promise<T | null>;
  put<T>(table: string, key: string, value: T): Promise<void>;
  putAll<T>(table: string, entries: ReadonlyArray<[string, T]>): Promise<void>;
  delete(table: string, key: string): Promise<void>;
  clear(table: string): Promise<void>;

  /**
   * Apply every op in a single atomic transaction. Either all ops commit or
   * none do (on failure the pre-transaction state is preserved and the
   * promise rejects).
   */
  transact(ops: readonly TransactOp[]): Promise<void>;

  /** Binary blobs (uploaded files). */
  getBlob(key: string): Promise<Blob | null>;
  putBlob(key: string, blob: Blob): Promise<void>;
  deleteBlob(key: string): Promise<void>;
  /** List every blob key currently stored. */
  getAllBlobKeys(): Promise<string[]>;
  /** Remove every stored blob. */
  clearBlobs(): Promise<void>;

  estimate(): Promise<StorageEstimate>;
}
