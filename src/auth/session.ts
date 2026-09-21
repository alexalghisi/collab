import type { AuthUser } from './types';

const TOKEN_KEY = 'collab.auth.token';
const SNAPSHOT_KEY = 'collab.auth.snapshot';

export interface SessionSnapshot {
  readonly token: string;
  readonly user: AuthUser;
}

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
    // Private mode can refuse storage; the session still lasts for this tab.
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures on sign-out.
  }
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as { uid?: unknown; displayName?: unknown };
  return typeof record.uid === 'string' && typeof record.displayName === 'string';
}

function parseSnapshot(raw: string): SessionSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as { token?: unknown; user?: unknown };
    if (typeof parsed.token !== 'string' || parsed.token.length === 0 || !isAuthUser(parsed.user)) {
      return null;
    }
    const email = (parsed.user as { email?: unknown }).email;
    const photoURL = (parsed.user as { photoURL?: unknown }).photoURL;
    return {
      token: parsed.token,
      user: {
        uid: parsed.user.uid,
        displayName: parsed.user.displayName,
        email: typeof email === 'string' ? email : null,
        photoURL: typeof photoURL === 'string' ? photoURL : null,
      },
    };
  } catch {
    return null;
  }
}

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
