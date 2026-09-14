import { storage } from '../storage/keyValue';
import type { AuthSession } from './types';

const KEY = 'collab.session';

/** The session from the last run, so signing in is not a daily chore. */
export function readStoredSession(): AuthSession | null {
  const raw = storage.read(KEY);
  if (!raw) {
    return null;
  }
  try {
    const stored = JSON.parse(raw) as AuthSession;
    return stored.token && stored.account?.id ? stored : null;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: AuthSession | null): void {
  if (session) {
    storage.write(KEY, JSON.stringify(session));
    return;
  }
  storage.remove(KEY);
}
