import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLiveMeeting, readLiveMeeting, writeLiveMeeting } from './resume';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('live meeting resume', () => {
  it('remembers the room across a tab refresh and forgets it after leave', () => {
    writeLiveMeeting({ roomId: 'room-1', sessionId: 'session-1' });

    expect(readLiveMeeting()).toEqual({ roomId: 'room-1', sessionId: 'session-1' });

    clearLiveMeeting();

    expect(readLiveMeeting()).toBeNull();
  });
});
