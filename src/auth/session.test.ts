import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from './types';

type StorageMap = Map<string, string>;

function installLocalStorage(map: StorageMap): void {
  const storage = {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      map.set(key, value);
    },
    removeItem: (key: string): void => {
      map.delete(key);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
}

const user: AuthUser = {
  uid: 'user-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  photoURL: 'https://example.com/ada.png',
};

const other: AuthUser = {
  uid: 'user-1',
  displayName: 'Ada L.',
  email: 'ada@example.com',
  photoURL: null,
};

describe('session snapshot', () => {
  const map: StorageMap = new Map();

  beforeEach(() => {
    map.clear();
    installLocalStorage(map);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('reads, writes and clears the token under the collab.auth key family', async () => {
    const session = await import('./session');
    expect(session.readSessionToken()).toBeNull();
    session.writeSessionToken('tok-1');
    expect(session.readSessionToken()).toBe('tok-1');
    expect([...map.keys()].every((key) => key.startsWith('collab.auth.'))).toBe(true);
    session.clearSessionToken();
    expect(session.readSessionToken()).toBeNull();
  });

  it('persists a token plus AuthUser snapshot and clears both together', async () => {
    const session = await import('./session');
    expect(session.readSessionSnapshot()).toBeNull();
    session.writeSessionSnapshot({ token: 'tok-2', user });
    expect(session.readSessionToken()).toBe('tok-2');
    expect(session.readSessionSnapshot()).toEqual({ token: 'tok-2', user });
    session.clearSessionToken();
    expect(session.readSessionToken()).toBeNull();
    expect(session.readSessionSnapshot()).toBeNull();
  });

  it('ignores a snapshot that is not a token plus AuthUser', async () => {
    const session = await import('./session');
    session.writeSessionSnapshot({ token: 'tok-3', user });
    const snapshotKey = [...map.keys()].find((key) => key !== 'collab.auth.token');
    expect(snapshotKey).toBeDefined();
    map.set(snapshotKey as string, '{"token":"tok-3"}');
    expect(session.readSessionSnapshot()).toBeNull();
  });
});

describe('restorePersistedSession', () => {
  const map: StorageMap = new Map();

  beforeEach(() => {
    map.clear();
    installLocalStorage(map);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('keeps the cached user when restoreAccount rejects with a network error', async () => {
    const session = await import('./session');
    session.writeSessionSnapshot({ token: 'tok-live', user });
    const restored = await session.restorePersistedSession(async () => {
      throw new Error('Could not restore your session.');
    });
    expect(restored).toEqual(user);
    expect(session.readSessionToken()).toBe('tok-live');
    expect(session.readSessionSnapshot()).toEqual({ token: 'tok-live', user });
  });

  it('keeps the cached user when the server is unreachable with a 5xx-style failure', async () => {
    const session = await import('./session');
    session.writeSessionSnapshot({ token: 'tok-live', user });
    const restored = await session.restorePersistedSession(async () => {
      throw Object.assign(new Error('Bad gateway'), { status: 502 });
    });
    expect(restored).toEqual(user);
    expect(session.readSessionToken()).toBe('tok-live');
  });

  it('clears the snapshot only when restoreAccount is explicitly unauthorized', async () => {
    const session = await import('./session');
    session.writeSessionSnapshot({ token: 'tok-dead', user });
    const restored = await session.restorePersistedSession(async () => {
      throw Object.assign(new Error('Sign in to continue.'), { status: 401 });
    });
    expect(restored).toBeNull();
    expect(session.readSessionToken()).toBeNull();
    expect(session.readSessionSnapshot()).toBeNull();
  });

  it('treats an unauthorized message as an invalid token even without a status', async () => {
    const session = await import('./session');
    session.writeSessionSnapshot({ token: 'tok-dead', user });
    const restored = await session.restorePersistedSession(async () => {
      throw new Error('unauthorized');
    });
    expect(restored).toBeNull();
    expect(session.readSessionSnapshot()).toBeNull();
  });

  it('refreshes the snapshot when restoreAccount succeeds', async () => {
    const session = await import('./session');
    session.writeSessionSnapshot({ token: 'tok-live', user });
    const restored = await session.restorePersistedSession(async (token) => {
      expect(token).toBe('tok-live');
      return other;
    });
    expect(restored).toEqual(other);
    expect(session.readSessionSnapshot()).toEqual({ token: 'tok-live', user: other });
  });

  it('returns null when nothing is stored', async () => {
    const session = await import('./session');
    const restored = await session.restorePersistedSession(async () => {
      throw new Error('should not be called');
    });
    expect(restored).toBeNull();
  });
});
