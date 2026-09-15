const LIVE_KEY = 'collab.liveMeeting';

export interface LiveMeeting {
  readonly roomId: string;
  readonly sessionId: string;
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

export function readLiveMeeting(): LiveMeeting | null {
  const raw = readSession(LIVE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LiveMeeting>;
    if (
      typeof parsed.roomId === 'string' &&
      parsed.roomId !== '' &&
      typeof parsed.sessionId === 'string' &&
      parsed.sessionId !== ''
    ) {
      return { roomId: parsed.roomId, sessionId: parsed.sessionId };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeLiveMeeting(meeting: LiveMeeting): void {
  writeSession(LIVE_KEY, JSON.stringify(meeting));
}

export function clearLiveMeeting(): void {
  clearSession(LIVE_KEY);
}
