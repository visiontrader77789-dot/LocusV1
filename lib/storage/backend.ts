/**
 * Storage backend interface.
 *
 * The React app never talks to IndexedDB directly. Everything goes through
 * this interface, so the web storage can be swapped for a native database in
 * the future Locus Desktop / Android / iOS builds, or for an in-memory backend
 * in tests.
 */

export interface StorageEstimate {
  usage: number;
  quota: number;
}

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
