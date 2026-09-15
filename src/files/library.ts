import { assertUploadable, readBlob, type UploadableFile } from './upload';

export interface LibraryFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly addedAt: number;
}

interface StoredLibraryFile extends LibraryFile {
  readonly ownerId: string;
  readonly bytes: ArrayBuffer;
}

export interface FileLibrary {
  list(ownerId: string): Promise<LibraryFile[]>;
  add(ownerId: string, file: UploadableFile): Promise<LibraryFile>;
  remove(ownerId: string, id: string): Promise<void>;
  read(ownerId: string, id: string): Promise<Blob>;
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function toPublic(file: StoredLibraryFile): LibraryFile {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    addedAt: file.addedAt,
  };
}

async function storedFrom(ownerId: string, file: UploadableFile): Promise<StoredLibraryFile> {
  assertUploadable(file);
  const blob = await readBlob(file);
  return {
    id: newId(),
    ownerId,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    addedAt: Date.now(),
    bytes: await blob.arrayBuffer(),
  };
}

function recordKey(ownerId: string, id: string): string {
  return `${ownerId}:${id}`;
}

/** In-memory library used in tests and when IndexedDB is not available. */
export class MemoryLibrary implements FileLibrary {
  private readonly files = new Map<string, StoredLibraryFile>();

  async list(ownerId: string): Promise<LibraryFile[]> {
    return [...this.files.values()]
      .filter((file) => file.ownerId === ownerId)
      .map(toPublic)
      .sort((left, right) => right.addedAt - left.addedAt);
  }

  async add(ownerId: string, file: UploadableFile): Promise<LibraryFile> {
    const stored = await storedFrom(ownerId, file);
    this.files.set(recordKey(ownerId, stored.id), stored);
    return toPublic(stored);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    this.files.delete(recordKey(ownerId, id));
  }

  async read(ownerId: string, id: string): Promise<Blob> {
    const stored = this.files.get(recordKey(ownerId, id));
    if (!stored) {
      throw new Error('That file is no longer on this device.');
    }
    return new Blob([stored.bytes], { type: stored.mimeType });
  }
}

const DB_NAME = 'collab-library';
const STORE = 'files';

class IndexedDbLibrary implements FileLibrary {
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('Could not open the file library.'));
    });
  }

  async list(ownerId: string): Promise<LibraryFile[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => {
        const rows = (request.result as Array<StoredLibraryFile & { key: string }>).filter(
          (row) => row.ownerId === ownerId,
        );
        resolve(rows.map(toPublic).sort((left, right) => right.addedAt - left.addedAt));
      };
      request.onerror = () => reject(request.error ?? new Error('Could not list files.'));
    });
  }

  async add(ownerId: string, file: UploadableFile): Promise<LibraryFile> {
    const stored = await storedFrom(ownerId, file);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE, 'readwrite')
        .objectStore(STORE)
        .put({ key: recordKey(ownerId, stored.id), ...stored });
      request.onsuccess = () => resolve(toPublic(stored));
      request.onerror = () => reject(request.error ?? new Error('Could not save that file.'));
    });
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE, 'readwrite')
        .objectStore(STORE)
        .delete(recordKey(ownerId, id));
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Could not remove that file.'));
    });
  }

  async read(ownerId: string, id: string): Promise<Blob> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE, 'readonly')
        .objectStore(STORE)
        .get(recordKey(ownerId, id));
      request.onsuccess = () => {
        const stored = request.result as (StoredLibraryFile & { key: string }) | undefined;
        if (!stored) {
          reject(new Error('That file is no longer on this device.'));
          return;
        }
        resolve(new Blob([stored.bytes], { type: stored.mimeType }));
      };
      request.onerror = () => reject(request.error ?? new Error('Could not read that file.'));
    });
  }
}

let shared: FileLibrary | null = null;

export function getFileLibrary(): FileLibrary {
  if (!shared) {
    shared = typeof indexedDB === 'undefined' ? new MemoryLibrary() : new IndexedDbLibrary();
  }
  return shared;
}

export function resetFileLibrary(library: FileLibrary): void {
  shared = library;
}
