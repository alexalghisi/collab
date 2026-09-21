import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from './types';

type StorageMap = Map<string, string>;

const { map } = vi.hoisted(() => ({ map: new Map<string, string>() as StorageMap }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string): Promise<string | null> => map.get(key) ?? null,
    setItem: async (key: string, value: string): Promise<void> => {
      map.set(key, value);
    },
    removeItem: async (key: string): Promise<void> => {
      map.delete(key);
    },
    multiRemove: async (keys: readonly string[]): Promise<void> => {
      for (const key of keys) {
        map.delete(key);
      }
    },
  },
}));

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

describe('native session snapshot', () => {
  beforeEach(() => {
    map.clear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('reads, writes and clears the token under the collab.auth key family', async () => {
    const session = await import('./session.native');
    expect(await session.readSessionToken()).toBeNull();
    await session.writeSessionToken('tok-1');
    expect(await session.readSessionToken()).toBe('tok-1');
    expect([...map.keys()].every((key) => key.startsWith('collab.auth.'))).toBe(true);
    expect(map.size).toBeGreaterThan(0);
    await session.clearSessionToken();
    expect(await session.readSessionToken()).toBeNull();
    expect(map.size).toBe(0);
  });

  it('persists a token plus AuthUser snapshot and clears both together', async () => {
    const session = await import('./session.native');
    expect(await session.readSessionSnapshot()).toBeNull();
    await session.writeSessionSnapshot({ token: 'tok-2', user });
    expect(await session.readSessionToken()).toBe('tok-2');
    expect(await session.readSessionSnapshot()).toEqual({ token: 'tok-2', user });
    expect(map.size).toBeGreaterThan(0);
    await session.clearSessionToken();
    expect(await session.readSessionToken()).toBeNull();
    expect(await session.readSessionSnapshot()).toBeNull();
    expect(map.size).toBe(0);
  });

  it('restores the snapshot from native storage after the process is gone', async () => {
    const session = await import('./session.native');
    await session.writeSessionSnapshot({ token: 'tok-live', user });
    expect(map.size).toBeGreaterThan(0);
    vi.resetModules();
    const again = await import('./session.native');
    expect(await again.readSessionSnapshot()).toEqual({ token: 'tok-live', user });
    expect(again.readSessionToken()).toBe('tok-live');
  });

  it('ignores a snapshot that is not a token plus AuthUser', async () => {
    const session = await import('./session.native');
    await session.writeSessionSnapshot({ token: 'tok-3', user });
    const snapshotKey = [...map.keys()].find((key) => key !== 'collab.auth.token');
    expect(snapshotKey).toBeDefined();
    map.set(snapshotKey as string, '{"token":"tok-3"}');
    expect(await session.readSessionSnapshot()).toBeNull();
  });
});

describe('native restorePersistedSession', () => {
  beforeEach(() => {
    map.clear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('keeps the cached user when restoreAccount rejects with a network error', async () => {
    const session = await import('./session.native');
    await session.writeSessionSnapshot({ token: 'tok-live', user });
    const restored = await session.restorePersistedSession(async () => {
      throw new Error('Could not restore your session.');
    });
    expect(restored).toEqual(user);
    expect(await session.readSessionToken()).toBe('tok-live');
    expect(await session.readSessionSnapshot()).toEqual({ token: 'tok-live', user });
    expect(map.size).toBeGreaterThan(0);
  });

  it('keeps the cached user when the server is unreachable with a 5xx-style failure', async () => {
    const session = await import('./session.native');
    await session.writeSessionSnapshot({ token: 'tok-live', user });
    const restored = await session.restorePersistedSession(async () => {
      throw Object.assign(new Error('Bad gateway'), { status: 502 });
    });
    expect(restored).toEqual(user);
    expect(await session.readSessionToken()).toBe('tok-live');
    expect(map.size).toBeGreaterThan(0);
  });

  it('clears the snapshot only when restoreAccount is explicitly unauthorized', async () => {
    const session = await import('./session.native');
    await session.writeSessionSnapshot({ token: 'tok-dead', user });
    const restored = await session.restorePersistedSession(async () => {
      throw Object.assign(new Error('Sign in to continue.'), { status: 401 });
    });
    expect(restored).toBeNull();
    expect(await session.readSessionToken()).toBeNull();
    expect(await session.readSessionSnapshot()).toBeNull();
    expect(map.size).toBe(0);
  });

  it('treats an unauthorized message as an invalid token even without a status', async () => {
    const session = await import('./session.native');
    await session.writeSessionSnapshot({ token: 'tok-dead', user });
    const restored = await session.restorePersistedSession(async () => {
      throw new Error('unauthorized');
    });
    expect(restored).toBeNull();
    expect(await session.readSessionSnapshot()).toBeNull();
    expect(map.size).toBe(0);
  });

  it('refreshes the snapshot when restoreAccount succeeds', async () => {
    const session = await import('./session.native');
    await session.writeSessionSnapshot({ token: 'tok-live', user });
    const restored = await session.restorePersistedSession(async (token) => {
      expect(token).toBe('tok-live');
      return other;
    });
    expect(restored).toEqual(other);
    expect(await session.readSessionSnapshot()).toEqual({ token: 'tok-live', user: other });
  });

  it('returns null when nothing is stored', async () => {
    const session = await import('./session.native');
    const restored = await session.restorePersistedSession(async () => {
      throw new Error('should not be called');
    });
    expect(restored).toBeNull();
  });

  it('restores from native storage after a process restart and a network error', async () => {
    const session = await import('./session.native');
    await session.writeSessionSnapshot({ token: 'tok-live', user });
    vi.resetModules();
    const again = await import('./session.native');
    const restored = await again.restorePersistedSession(async () => {
      throw new Error('Could not restore your session.');
    });
    expect(restored).toEqual(user);
    expect(await again.readSessionSnapshot()).toEqual({ token: 'tok-live', user });
  });
});
