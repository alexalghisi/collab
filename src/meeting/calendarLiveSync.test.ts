import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarWindow, SYNC_TOKEN_EXPIRED, type GoogleCalendarEvent } from './googleCalendar';
import { runCalendarLiveSync, type CalendarLiveSyncCycle } from './calendarLiveSync';
import { reconcileGoogleCalendar } from './reconcileGoogleCalendar';
import { readGoogleCalendarSyncToken, writeGoogleCalendarSyncToken } from './googleCalendarStore';
import type { Meeting } from './types';

const timed: GoogleCalendarEvent = {
  id: 'evt-1',
  status: 'confirmed',
  summary: 'Standup',
  description: 'Daily',
  location: 'https://alexalghisi.github.io/collab/?room=kqz-wrtm-pfa',
  start: { dateTime: '2026-09-16T09:00:00.000Z' },
  end: { dateTime: '2026-09-16T09:30:00.000Z' },
};

const linked: Meeting = {
  id: 'm-linked',
  title: 'Standup',
  roomId: 'kqz-wrtm-pfa',
  startsAt: Date.parse('2026-09-16T09:00:00.000Z'),
  durationMinutes: 30,
  description: 'Daily',
  createdAt: 1,
  googleEventId: 'evt-1',
  fromGoogle: true,
};

const pushed: Meeting = {
  id: 'm-pushed',
  title: 'Local only on Google',
  roomId: 'room-pushed',
  startsAt: Date.parse('2026-09-16T10:00:00.000Z'),
  durationMinutes: 45,
  description: '',
  createdAt: 2,
  googleEventId: 'evt-9',
  fromGoogle: false,
};

const unlinked: Meeting = {
  id: 'm-local',
  title: 'Not pushed yet',
  roomId: 'room-local',
  startsAt: Date.parse('2026-09-16T11:00:00.000Z'),
  durationMinutes: 30,
  description: '',
  createdAt: 3,
};

const standupDraft = {
  title: 'Standup',
  roomId: 'kqz-wrtm-pfa',
  startsAt: Date.parse('2026-09-16T09:00:00.000Z'),
  durationMinutes: 30,
  description: 'Daily',
  googleEventId: 'evt-1',
  fromGoogle: true,
};

const window = calendarWindow(Date.parse('2026-09-16T12:00:00.000Z'));

const expired = Object.assign(new Error('Google Calendar access expired. Connect it again.'), {
  status: 401,
});

function cycle(overrides: Partial<CalendarLiveSyncCycle> = {}): CalendarLiveSyncCycle {
  return {
    connected: true,
    accessToken: 'ya29.token',
    syncToken: null,
    meetings: [],
    window,
    fallbackRoomId: () => 'fallback-room',
    listEvents: async () => ({ events: [], nextSyncToken: null }),
    applyGoogle: async () => undefined,
    removeMeeting: async () => undefined,
    pushLocal: async () => undefined,
    writeSyncToken: () => undefined,
    rememberToken: () => undefined,
    requestSilentToken: async () => 'ya29.silent',
    ...overrides,
  };
}

describe('reconcileGoogleCalendar', () => {
  it('removes the linked Collab meeting when Google cancels the event', () => {
    const result = reconcileGoogleCalendar(
      [linked, pushed, unlinked],
      [
        { id: 'evt-1', status: 'cancelled' },
        { id: 'evt-9', status: 'cancelled' },
      ],
      { fullWindow: false, fallbackRoomId: () => 'fallback-room' },
    );

    expect(result.removeIds).toEqual(['m-linked', 'm-pushed']);
    expect(result.upserts).toEqual([]);
  });

  it('upserts an active Google event and leaves that meeting in place', () => {
    const result = reconcileGoogleCalendar([linked, unlinked], [timed], {
      fullWindow: false,
      fallbackRoomId: () => 'fallback-room',
    });

    expect(result.upserts).toEqual([standupDraft]);
    expect(result.removeIds).toEqual([]);
  });

  it('removes a linked meeting missing from a full window and keeps an unlinked one', () => {
    const result = reconcileGoogleCalendar([linked, pushed, unlinked], [], {
      fullWindow: true,
      fallbackRoomId: () => 'fallback-room',
    });

    expect(result.removeIds).toEqual(['m-linked', 'm-pushed']);
  });

  it('keeps a linked meeting that is only absent from an incremental page', () => {
    const result = reconcileGoogleCalendar([linked, unlinked], [], {
      fullWindow: false,
      fallbackRoomId: () => 'fallback-room',
    });

    expect(result.removeIds).toEqual([]);
    expect(result.upserts).toEqual([]);
  });
});

describe('Google Calendar sync token persistence', () => {
  const memory = new Map<string, string>();

  beforeEach(() => {
    memory.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores the sync token beside the calendar access token', () => {
    writeGoogleCalendarSyncToken('user-1', 'tok-1');

    expect(memory.get('collab.googleCalendar.user-1.syncToken')).toBe('tok-1');
    expect(readGoogleCalendarSyncToken('user-1')).toBe('tok-1');
    expect(memory.has('collab.googleCalendar.user-1.token')).toBe(false);
  });

  it('treats an empty sync token as missing', () => {
    memory.set('collab.googleCalendar.user-1.syncToken', 'tok-1');
    writeGoogleCalendarSyncToken('user-1', null);

    expect(readGoogleCalendarSyncToken('user-1')).toBeNull();
    expect(memory.get('collab.googleCalendar.user-1.syncToken') ?? '').toBe('');
  });
});

describe('runCalendarLiveSync', () => {
  it('does not call Google when disconnected', async () => {
    const listEvents = vi.fn(async () => ({ events: [timed], nextSyncToken: 'tok-1' }));
    const pushLocal = vi.fn(async () => undefined);
    const requestSilentToken = vi.fn(async () => 'ya29.silent');
    const applyGoogle = vi.fn(async () => undefined);
    const removeMeeting = vi.fn(async () => undefined);

    const outcome = await runCalendarLiveSync(
      cycle({
        connected: false,
        accessToken: 'ya29.token',
        syncToken: 'tok-1',
        meetings: [linked],
        listEvents,
        pushLocal,
        requestSilentToken,
        applyGoogle,
        removeMeeting,
      }),
    );

    expect(outcome).toEqual({ stopped: false, error: null });
    expect(listEvents).not.toHaveBeenCalled();
    expect(pushLocal).not.toHaveBeenCalled();
    expect(requestSilentToken).not.toHaveBeenCalled();
    expect(applyGoogle).not.toHaveBeenCalled();
    expect(removeMeeting).not.toHaveBeenCalled();
  });

  it('stores the sync token and reuses it on the next pull', async () => {
    let stored: string | null = null;
    const listEvents = vi
      .fn<CalendarLiveSyncCycle['listEvents']>()
      .mockResolvedValueOnce({ events: [timed], nextSyncToken: 'tok-1' })
      .mockResolvedValueOnce({ events: [], nextSyncToken: 'tok-2' });
    const applyGoogle = vi.fn(async () => undefined);
    const pushLocal = vi.fn(async () => undefined);

    await runCalendarLiveSync(
      cycle({
        syncToken: stored,
        meetings: [linked],
        listEvents,
        applyGoogle,
        pushLocal,
        writeSyncToken: (value) => {
          stored = value;
        },
      }),
    );

    expect(listEvents).toHaveBeenNthCalledWith(1, 'ya29.token', { window });
    expect(applyGoogle).toHaveBeenCalledWith([standupDraft]);
    expect(pushLocal).toHaveBeenCalledWith('ya29.token');
    expect(stored).toBe('tok-1');

    await runCalendarLiveSync(
      cycle({
        syncToken: stored,
        meetings: [linked],
        listEvents,
        applyGoogle,
        pushLocal,
        writeSyncToken: (value) => {
          stored = value;
        },
      }),
    );

    expect(listEvents).toHaveBeenNthCalledWith(2, 'ya29.token', { syncToken: 'tok-1' });
    expect(stored).toBe('tok-2');
  });

  it('drops the sync token and lists the full window once after 410', async () => {
    const listEvents = vi
      .fn<CalendarLiveSyncCycle['listEvents']>()
      .mockRejectedValueOnce(new Error(SYNC_TOKEN_EXPIRED))
      .mockResolvedValueOnce({
        events: [{ ...timed, id: 'evt-2', summary: 'Moved' }],
        nextSyncToken: 'tok-fresh',
      });
    const writeSyncToken = vi.fn();
    const removeMeeting = vi.fn(async () => undefined);
    const applyGoogle = vi.fn(async () => undefined);

    const outcome = await runCalendarLiveSync(
      cycle({
        syncToken: 'stale',
        meetings: [linked, unlinked],
        listEvents,
        writeSyncToken,
        removeMeeting,
        applyGoogle,
      }),
    );

    expect(outcome).toEqual({ stopped: false, error: null });
    expect(writeSyncToken).toHaveBeenNthCalledWith(1, null);
    expect(listEvents).toHaveBeenNthCalledWith(1, 'ya29.token', { syncToken: 'stale' });
    expect(listEvents).toHaveBeenNthCalledWith(2, 'ya29.token', { window });
    expect(removeMeeting).toHaveBeenCalledTimes(1);
    expect(removeMeeting).toHaveBeenCalledWith('m-linked');
    expect(applyGoogle).toHaveBeenCalledWith([
      {
        title: 'Moved',
        roomId: 'kqz-wrtm-pfa',
        startsAt: Date.parse('2026-09-16T09:00:00.000Z'),
        durationMinutes: 30,
        description: 'Daily',
        googleEventId: 'evt-2',
        fromGoogle: true,
      },
    ]);
    expect(writeSyncToken).toHaveBeenNthCalledWith(2, 'tok-fresh');
  });

  it('removes a cancelled Google event and still pushes unlinked local meetings', async () => {
    const removeMeeting = vi.fn(async () => undefined);
    const applyGoogle = vi.fn(async () => undefined);
    const pushLocal = vi.fn(async () => undefined);

    await runCalendarLiveSync(
      cycle({
        syncToken: 'tok-1',
        meetings: [linked, unlinked],
        listEvents: async () => ({
          events: [{ id: 'evt-1', status: 'cancelled' }],
          nextSyncToken: 'tok-2',
        }),
        removeMeeting,
        applyGoogle,
        pushLocal,
      }),
    );

    expect(removeMeeting).toHaveBeenCalledTimes(1);
    expect(removeMeeting).toHaveBeenCalledWith('m-linked');
    expect(applyGoogle).toHaveBeenCalledWith([]);
    expect(pushLocal).toHaveBeenCalledWith('ya29.token');
  });

  it('retries once with a silent token after 401', async () => {
    const listEvents = vi
      .fn<CalendarLiveSyncCycle['listEvents']>()
      .mockRejectedValueOnce(expired)
      .mockResolvedValueOnce({ events: [], nextSyncToken: 'tok-2' });
    const requestSilentToken = vi.fn(async () => 'ya29.fresh');
    const rememberToken = vi.fn();
    const pushLocal = vi.fn(async () => undefined);

    const outcome = await runCalendarLiveSync(
      cycle({
        accessToken: 'ya29.dead',
        syncToken: 'tok-1',
        listEvents,
        requestSilentToken,
        rememberToken,
        pushLocal,
      }),
    );

    expect(outcome).toEqual({ stopped: false, error: null });
    expect(requestSilentToken).toHaveBeenCalledOnce();
    expect(rememberToken).toHaveBeenCalledWith('ya29.fresh');
    expect(listEvents).toHaveBeenNthCalledWith(1, 'ya29.dead', { syncToken: 'tok-1' });
    expect(listEvents).toHaveBeenNthCalledWith(2, 'ya29.fresh', { syncToken: 'tok-1' });
    expect(pushLocal).toHaveBeenCalledWith('ya29.fresh');
  });

  it('stops the loop when the silent token request fails', async () => {
    const listEvents = vi.fn<CalendarLiveSyncCycle['listEvents']>().mockRejectedValue(expired);
    const requestSilentToken = vi.fn(async () => {
      throw new Error('Google Calendar access was cancelled.');
    });
    const rememberToken = vi.fn();
    const pushLocal = vi.fn(async () => undefined);

    const outcome = await runCalendarLiveSync(
      cycle({
        accessToken: 'ya29.dead',
        syncToken: 'tok-1',
        listEvents,
        requestSilentToken,
        rememberToken,
        pushLocal,
      }),
    );

    expect(requestSilentToken).toHaveBeenCalledOnce();
    expect(listEvents).toHaveBeenCalledOnce();
    expect(pushLocal).not.toHaveBeenCalled();
    expect(rememberToken).toHaveBeenCalledWith(null);
    expect(outcome).toEqual({
      stopped: true,
      error: 'Google Calendar access was cancelled.',
    });
  });
});
