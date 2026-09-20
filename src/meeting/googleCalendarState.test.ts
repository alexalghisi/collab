import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  forgetGoogleCalendar,
  readConnected,
  readSyncToken,
  writeConnected,
  writeSyncToken,
} from './googleCalendarState';

const globals = globalThis as { window?: unknown };

function fakeBrowser(): Map<string, string> {
  const entries = new Map<string, string>();
  globals.window = {
    localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
      removeItem: (key: string) => {
        entries.delete(key);
      },
    },
  };
  return entries;
}

describe('google calendar state', () => {
  let entries: Map<string, string>;

  beforeEach(() => {
    entries = fakeBrowser();
  });

  afterEach(() => {
    delete globals.window;
  });

  it('remembers the connection so a later session does not start from scratch', () => {
    writeConnected('user-1', true);

    expect(readConnected('user-1')).toBe(true);
    expect(entries.get('collab.googleCalendar.user-1')).toBe('1');
  });

  it('keeps the sync token, which is what makes the next run incremental', () => {
    writeSyncToken('user-1', 'tok-1');

    expect(readSyncToken('user-1')).toBe('tok-1');
  });

  it('keeps one account out of another account state', () => {
    writeConnected('user-1', true);
    writeSyncToken('user-1', 'tok-1');

    expect(readConnected('user-2')).toBe(false);
    expect(readSyncToken('user-2')).toBeNull();
  });

  it('reads an unknown account as disconnected with nothing synced', () => {
    expect(readConnected('nobody')).toBe(false);
    expect(readSyncToken('nobody')).toBeNull();
  });

  it('reports no token once it is cleared, so the next run rereads the window', () => {
    writeSyncToken('user-1', 'tok-1');
    writeSyncToken('user-1', null);

    expect(readSyncToken('user-1')).toBeNull();
  });

  it('drops both halves of the state when the account disconnects', () => {
    writeConnected('user-1', true);
    writeSyncToken('user-1', 'tok-1');

    forgetGoogleCalendar('user-1');

    expect(readConnected('user-1')).toBe(false);
    expect(readSyncToken('user-1')).toBeNull();
  });

  it('survives a browser that refuses storage instead of breaking the calendar', () => {
    globals.window = {
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
        removeItem: () => {},
      },
    };

    expect(() => writeConnected('user-1', true)).not.toThrow();
    expect(() => writeSyncToken('user-1', 'tok-1')).not.toThrow();
    expect(readConnected('user-1')).toBe(false);
    expect(readSyncToken('user-1')).toBeNull();
  });
});
