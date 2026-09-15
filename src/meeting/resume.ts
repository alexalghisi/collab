import { storage } from './storage';

const LIVE_KEY = 'collab.liveMeeting';

export interface LiveMeeting {
  readonly roomId: string;
  readonly sessionId: string;
  readonly displayName: string;
  readonly video: boolean;
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    return;
  }
}

function clearSession(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    return;
  }
}

function readLocal(key: string): string | null {
  try {
    return storage.read(key);
  } catch {
    return null;
  }
}

function parseLive(raw: string | null): LiveMeeting | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LiveMeeting>;
    if (
      typeof parsed.roomId !== 'string' ||
      parsed.roomId === '' ||
      typeof parsed.sessionId !== 'string' ||
      parsed.sessionId === ''
    ) {
      return null;
    }
    return {
      roomId: parsed.roomId,
      sessionId: parsed.sessionId,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
      video: parsed.video !== false,
    };
  } catch {
    return null;
  }
}

export function readLiveMeeting(): LiveMeeting | null {
  return parseLive(readSession(LIVE_KEY)) ?? parseLive(readLocal(LIVE_KEY));
}

export function writeLiveMeeting(meeting: LiveMeeting): void {
  const raw = JSON.stringify(meeting);
  writeSession(LIVE_KEY, raw);
  try {
    storage.write(LIVE_KEY, raw);
  } catch {
    return;
  }
}

export function clearLiveMeeting(): void {
  clearSession(LIVE_KEY);
  try {
    storage.remove(LIVE_KEY);
  } catch {
    return;
  }
}
