import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readGoogleCalendarConnected,
  readGoogleCalendarToken,
  writeGoogleCalendarConnected,
  writeGoogleCalendarToken,
} from './googleCalendarStore';

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
  vi.stubGlobal('window', { localStorage: store });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Google Calendar token persistence', () => {
  it('stores the access token next to the connected flag', () => {
    writeGoogleCalendarConnected('user-1', true);
    writeGoogleCalendarToken('user-1', 'ya29.live');

    expect(memory.get('collab.googleCalendar.user-1')).toBe('1');
    expect(memory.get('collab.googleCalendar.user-1.token')).toBe('ya29.live');
    expect(readGoogleCalendarConnected('user-1')).toBe(true);
    expect(readGoogleCalendarToken('user-1')).toBe('ya29.live');
  });

  it('hydrates a previously stored token and treats an empty value as missing', () => {
    memory.set('collab.googleCalendar.user-1', '1');
    memory.set('collab.googleCalendar.user-1.token', 'ya29.restored');

    expect(readGoogleCalendarConnected('user-1')).toBe(true);
    expect(readGoogleCalendarToken('user-1')).toBe('ya29.restored');

    writeGoogleCalendarToken('user-1', null);
    expect(readGoogleCalendarToken('user-1')).toBeNull();
    expect(memory.get('collab.googleCalendar.user-1.token') ?? '').toBe('');
    expect(readGoogleCalendarConnected('user-1')).toBe(true);
  });

  it('clears the token on disconnect and on 401', () => {
    writeGoogleCalendarConnected('user-1', true);
    writeGoogleCalendarToken('user-1', 'ya29.dead');

    writeGoogleCalendarToken('user-1', null);
    expect(readGoogleCalendarToken('user-1')).toBeNull();

    writeGoogleCalendarConnected('user-1', false);
    writeGoogleCalendarToken('user-1', null);
    expect(readGoogleCalendarConnected('user-1')).toBe(false);
    expect(readGoogleCalendarToken('user-1')).toBeNull();
  });
});
