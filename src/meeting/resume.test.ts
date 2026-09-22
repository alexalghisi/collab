import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLiveMeeting, readLiveMeeting, writeLiveMeeting } from './resume';

const sessionMemory = new Map<string, string>();
const localMemory = new Map<string, string>();

function createStore(mem: Map<string, string>) {
  return {
    getItem: (key: string) => mem.get(key) ?? null,
    setItem: (key: string, value: string) => {
      mem.set(key, value);
    },
    removeItem: (key: string) => {
      mem.delete(key);
    },
  };
}

beforeEach(() => {
  sessionMemory.clear();
  localMemory.clear();
  vi.stubGlobal('sessionStorage', createStore(sessionMemory));
  vi.stubGlobal('window', { localStorage: createStore(localMemory) });
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

  it('keeps the camera on after a refresh only when that session had it on', () => {
    writeLiveMeeting({
      roomId: 'room-1',
      sessionId: 'session-1',
      displayName: 'Ada',
      video: true,
    });

    expect(readLiveMeeting()?.video).toBe(true);
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
      video: false,
    });
  });

  it('does not resurrect meetings from localStorage when sessionStorage is empty on web', () => {
    window.localStorage.setItem(
      'collab.liveMeeting',
      JSON.stringify({ roomId: 'stale-room', sessionId: 'stale-session' }),
    );

    expect(readLiveMeeting()).toBeNull();
  });
});
