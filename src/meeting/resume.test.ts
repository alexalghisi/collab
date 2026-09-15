import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLiveMeeting, readLiveMeeting, writeLiveMeeting } from './resume';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  const store = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  };
  vi.stubGlobal('sessionStorage', store);
  vi.stubGlobal('window', { localStorage: store });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('live meeting resume', () => {
  it('remembers the room, name, and camera across a tab refresh and forgets them after leave', () => {
    writeLiveMeeting({
      roomId: 'room-1',
      sessionId: 'session-1',
      displayName: 'Ada',
      video: false,
    });

    expect(readLiveMeeting()).toEqual({
      roomId: 'room-1',
      sessionId: 'session-1',
      displayName: 'Ada',
      video: false,
    });

    clearLiveMeeting();

    expect(readLiveMeeting()).toBeNull();
  });

  it('fills in a missing name from older live-meeting records', () => {
    sessionStorage.setItem(
      'collab.liveMeeting',
      JSON.stringify({ roomId: 'room-1', sessionId: 'session-1' }),
    );

    expect(readLiveMeeting()).toEqual({
      roomId: 'room-1',
      sessionId: 'session-1',
      displayName: '',
      video: true,
    });
  });
});
