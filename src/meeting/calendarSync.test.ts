import { describe, expect, it, vi } from 'vitest';
import { pullGoogleCalendar } from './calendarSync';
import { SYNC_TOKEN_EXPIRED, type CalendarPage, type CalendarQuery } from './googleCalendar';
import type { MeetingDraft } from './types';

const window = { timeMin: '2026-08-17T12:00:00.000Z', timeMax: '2027-09-16T12:00:00.000Z' };

const event = {
  id: 'evt-1',
  summary: 'Standup',
  start: { dateTime: '2026-09-16T09:00:00.000Z' },
  end: { dateTime: '2026-09-16T09:30:00.000Z' },
};

function harness(pages: Array<CalendarPage | Error>) {
  const queries: CalendarQuery[] = [];
  const applied: Array<{ drafts: MeetingDraft[]; cancelled: string[] }> = [];
  return {
    queries,
    applied,
    deps: {
      list: async (query: CalendarQuery) => {
        queries.push(query);
        const next = pages.shift();
        if (next instanceof Error) {
          throw next;
        }
        return next ?? { events: [], nextSyncToken: null };
      },
      apply: async (drafts: MeetingDraft[], cancelled: string[]) => {
        applied.push({ drafts, cancelled });
      },
      roomId: () => 'fallback-room',
      window: () => window,
    },
  };
}

describe('pullGoogleCalendar', () => {
  it('reads the whole window the first time, when nothing has been synced yet', async () => {
    const { deps, queries } = harness([{ events: [event], nextSyncToken: 'tok-1' }]);

    const token = await pullGoogleCalendar(deps, null);

    expect(queries).toEqual([{ window }]);
    expect(token).toBe('tok-1');
  });

  it('asks only for what changed once a token is stored', async () => {
    const { deps, queries } = harness([{ events: [], nextSyncToken: 'tok-2' }]);

    const token = await pullGoogleCalendar(deps, 'tok-1');

    expect(queries).toEqual([{ syncToken: 'tok-1' }]);
    expect(token).toBe('tok-2');
  });

  it('starts over on a full window when Google retires the token', async () => {
    const { deps, queries, applied } = harness([
      new Error(SYNC_TOKEN_EXPIRED),
      { events: [event], nextSyncToken: 'tok-3' },
    ]);

    const token = await pullGoogleCalendar(deps, 'stale');

    expect(queries).toEqual([{ syncToken: 'stale' }, { window }]);
    expect(applied).toHaveLength(1);
    expect(applied[0].drafts[0].googleEventId).toBe('evt-1');
    expect(token).toBe('tok-3');
  });

  it('keeps the stored token when the run fails for any other reason', async () => {
    const { deps, applied } = harness([new Error('Could not reach Google Calendar.')]);

    await expect(pullGoogleCalendar(deps, 'tok-1')).rejects.toThrow(
      'Could not reach Google Calendar.',
    );
    expect(applied).toEqual([]);
  });

  it('hands the cancelled ids to the merge alongside the drafts', async () => {
    const { deps, applied } = harness([
      {
        events: [event, { id: 'evt-gone', status: 'cancelled' }],
        nextSyncToken: 'tok-4',
      },
      null as never,
    ]);

    await pullGoogleCalendar(deps, null);

    expect(applied[0].drafts.map((draft) => draft.googleEventId)).toEqual(['evt-1']);
    expect(applied[0].cancelled).toEqual(['evt-gone']);
  });

  it('gives each event without an invite link a room of its own', async () => {
    const roomId = vi.fn().mockReturnValueOnce('room-a').mockReturnValueOnce('room-b');
    const { deps, applied } = harness([
      { events: [event, { ...event, id: 'evt-2' }], nextSyncToken: null },
    ]);

    await pullGoogleCalendar({ ...deps, roomId }, null);

    expect(applied[0].drafts.map((draft) => draft.roomId)).toEqual(['room-a', 'room-b']);
  });

  it('reports no token when Google did not send one, so the next run rereads the window', async () => {
    const { deps } = harness([{ events: [], nextSyncToken: null }]);

    expect(await pullGoogleCalendar(deps, null)).toBeNull();
  });
});
