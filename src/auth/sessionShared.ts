import type { AuthUser } from './types';

export const TOKEN_KEY = 'collab.auth.token';
export const SNAPSHOT_KEY = 'collab.auth.snapshot';

export interface SessionSnapshot {
  readonly token: string;
  readonly user: AuthUser;
}

export interface SessionStore {
  readToken(): string | null | Promise<string | null>;
  readSnapshot(): SessionSnapshot | null | Promise<SessionSnapshot | null>;
  writeSnapshot(snapshot: SessionSnapshot): void | Promise<void>;
  clear(): void | Promise<void>;
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as { uid?: unknown; displayName?: unknown };
  return typeof record.uid === 'string' && typeof record.displayName === 'string';
}

export function parseSnapshot(raw: string): SessionSnapshot | null {
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

export async function restorePersistedSessionFromStore(
  store: SessionStore,
  restore: (token: string) => Promise<AuthUser>,
): Promise<AuthUser | null> {
  const snapshot = await store.readSnapshot();
  const token = snapshot?.token ?? (await store.readToken());
  if (!token) {
    return snapshot?.user ?? null;
  }
  try {
    const next = await restore(token);
    await store.writeSnapshot({ token, user: next });
    return next;
  } catch (cause) {
    if (isUnauthorizedRestore(cause)) {
      await store.clear();
      return null;
    }
    return snapshot?.user ?? null;
  }
}
