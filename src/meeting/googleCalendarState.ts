import { storage } from './storage';

const connectedKey = (uid: string) => `collab.googleCalendar.${uid}`;
const syncTokenKey = (uid: string) => `collab.googleCalendar.token.${uid}`;

export function readConnected(uid: string): boolean {
  try {
    return storage.read(connectedKey(uid)) === '1';
  } catch {
    return false;
  }
}

export function writeConnected(uid: string, connected: boolean): void {
  try {
    storage.write(connectedKey(uid), connected ? '1' : '');
  } catch {
    return;
  }
}

export function readSyncToken(uid: string): string | null {
  try {
    const stored = storage.read(syncTokenKey(uid));
    return stored ? stored : null;
  } catch {
    return null;
  }
}

export function writeSyncToken(uid: string, token: string | null): void {
  try {
    storage.write(syncTokenKey(uid), token ?? '');
  } catch {
    return;
  }
}

export function forgetGoogleCalendar(uid: string): void {
  writeConnected(uid, false);
  writeSyncToken(uid, null);
}
