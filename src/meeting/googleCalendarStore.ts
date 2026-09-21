import { storage } from './storage';

export function googleCalendarConnectedKey(uid: string): string {
  return `collab.googleCalendar.${uid}`;
}

export function googleCalendarTokenKey(uid: string): string {
  return `collab.googleCalendar.${uid}.token`;
}

export function googleCalendarSyncTokenKey(uid: string): string {
  return `collab.googleCalendar.${uid}.syncToken`;
}

export function readGoogleCalendarConnected(uid: string): boolean {
  try {
    return storage.read(googleCalendarConnectedKey(uid)) === '1';
  } catch {
    return false;
  }
}

export function writeGoogleCalendarConnected(uid: string, connected: boolean): void {
  try {
    storage.write(googleCalendarConnectedKey(uid), connected ? '1' : '');
  } catch {
    return;
  }
}

export function readGoogleCalendarToken(uid: string): string | null {
  try {
    const value = storage.read(googleCalendarTokenKey(uid));
    return value ? value : null;
  } catch {
    return null;
  }
}

export function writeGoogleCalendarToken(uid: string, token: string | null): void {
  try {
    storage.write(googleCalendarTokenKey(uid), token ?? '');
  } catch {
    return;
  }
}

export function readGoogleCalendarSyncToken(uid: string): string | null {
  try {
    const value = storage.read(googleCalendarSyncTokenKey(uid));
    return value ? value : null;
  } catch {
    return null;
  }
}

export function writeGoogleCalendarSyncToken(uid: string, token: string | null): void {
  try {
    storage.write(googleCalendarSyncTokenKey(uid), token ?? '');
  } catch {
    return;
  }
}
