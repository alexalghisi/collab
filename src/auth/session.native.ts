import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser } from './types';
import {
  SNAPSHOT_KEY,
  TOKEN_KEY,
  isUnauthorizedRestore,
  parseSnapshot,
  restorePersistedSessionFromStore,
  type SessionSnapshot,
} from './sessionShared';

export type { SessionSnapshot };
export { isUnauthorizedRestore };

let memoryToken: string | null = null;

async function readStored(key: string): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(key)) ?? null;
  } catch {
    return null;
  }
}

async function writeStored(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    return;
  }
}

async function removeStored(keys: readonly string[]): Promise<void> {
  try {
    await AsyncStorage.multiRemove([...keys]);
  } catch {
    return;
  }
}

export async function hydrateSession(): Promise<SessionSnapshot | null> {
  const raw = await readStored(SNAPSHOT_KEY);
  const snapshot = raw ? parseSnapshot(raw) : null;
  if (snapshot) {
    memoryToken = snapshot.token;
    return snapshot;
  }
  memoryToken = await readStored(TOKEN_KEY);
  return null;
}

export function readSessionToken(): string | null {
  return memoryToken;
}

export async function writeSessionToken(token: string): Promise<void> {
  memoryToken = token;
  await writeStored(TOKEN_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  memoryToken = null;
  await removeStored([TOKEN_KEY, SNAPSHOT_KEY]);
}

export async function readSessionSnapshot(): Promise<SessionSnapshot | null> {
  return hydrateSession();
}

export async function writeSessionSnapshot(snapshot: SessionSnapshot): Promise<void> {
  memoryToken = snapshot.token;
  await writeSessionToken(snapshot.token);
  await writeStored(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function restorePersistedSession(
  restore: (token: string) => Promise<AuthUser>,
): Promise<AuthUser | null> {
  return restorePersistedSessionFromStore(
    {
      readToken: readSessionToken,
      readSnapshot: readSessionSnapshot,
      writeSnapshot: writeSessionSnapshot,
      clear: clearSessionToken,
    },
    restore,
  );
}
