import type { AuthUser } from './types';
import {
  SNAPSHOT_KEY,
  TOKEN_KEY,
  isUnauthorizedRestore,
  parseSnapshot,
  restorePersistedSessionFromStore,
  type SessionSnapshot,
} from './sessionShared';

export type { SessionSnapshot };
export { isUnauthorizedRestore };

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    return;
  }
}

export function readSessionToken(): string | null {
  return readStorage(TOKEN_KEY);
}

export function writeSessionToken(token: string): void {
  writeStorage(TOKEN_KEY, token);
}

export function clearSessionToken(): void {
  removeStorage(TOKEN_KEY);
  removeStorage(SNAPSHOT_KEY);
}

export function readSessionSnapshot(): SessionSnapshot | null {
  const raw = readStorage(SNAPSHOT_KEY);
  if (!raw) {
    return null;
  }
  return parseSnapshot(raw);
}

export function writeSessionSnapshot(snapshot: SessionSnapshot): void {
  writeSessionToken(snapshot.token);
  writeStorage(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function restorePersistedSession(
  restore: (token: string) => Promise<AuthUser>,
): Promise<AuthUser | null> {
  return restorePersistedSessionFromStore(
    {
      readToken: readSessionToken,
      readSnapshot: readSessionSnapshot,
      writeSnapshot: writeSessionSnapshot,
      clear: clearSessionToken,
    },
    restore,
  );
}
