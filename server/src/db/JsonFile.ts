import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * The local database behind accounts and scheduled meetings: one JSON file per
 * collection, read once when the store is built and rewritten in full on every
 * change. A deployment of this size does not need a database process, and the
 * file is easy to back up, inspect and delete.
 *
 * `null` for the path keeps everything in memory, which is what the tests use.
 */
export class JsonFile<T> {
  constructor(
    private readonly path: string | null,
    private readonly fallback: T,
  ) {}

  read(): T {
    if (!this.path || !existsSync(this.path)) {
      return this.fallback;
    }
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as T;
    } catch {
      // A truncated or hand-edited file must not take the server down with it.
      console.warn(`Ignoring unreadable database file at ${this.path}.`);
      return this.fallback;
    }
  }

  /** Writes beside the file and renames, so a crash cannot leave half a record. */
  write(value: T): void {
    if (!this.path) {
      return;
    }
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, this.path);
  }
}

/** Where a collection lives unless `DATA_DIR` says otherwise. */
export function databasePath(fileName: string, root: string): string {
  return `${process.env.DATA_DIR?.replace(/\/$/, '') ?? `${root}/server/.data`}/${fileName}`;
}
