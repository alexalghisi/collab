import type { AuthUser } from './types';

export interface SessionSnapshot {
  readonly token: string;
  readonly user: AuthUser;
}

let memoryToken: string | null = null;
let memorySnapshot: SessionSnapshot | null = null;

export function isUnauthorizedRestore(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') {
    return false;
  }
  const record = cause as { status?: unknown; message?: unknown };
  if (record.status === 401) {
    return true;
  }
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';
  return message.includes('unauthorized');
}

export function readSessionToken(): string | null {
  return memoryToken;
}

export function writeSessionToken(token: string): void {
  memoryToken = token;
}

export function clearSessionToken(): void {
  memoryToken = null;
  memorySnapshot = null;
}

export function readSessionSnapshot(): SessionSnapshot | null {
  return memorySnapshot;
}

export function writeSessionSnapshot(snapshot: SessionSnapshot): void {
  memoryToken = snapshot.token;
  memorySnapshot = snapshot;
}

export async function restorePersistedSession(
  restore: (token: string) => Promise<AuthUser>,
): Promise<AuthUser | null> {
  const snapshot = readSessionSnapshot();
  const token = snapshot?.token ?? readSessionToken();
  if (!token) {
    return snapshot?.user ?? null;
  }
  try {
    const next = await restore(token);
    writeSessionSnapshot({ token, user: next });
    return next;
  } catch (cause) {
    if (isUnauthorizedRestore(cause)) {
      clearSessionToken();
      return null;
    }
    return snapshot?.user ?? null;
  }
}
