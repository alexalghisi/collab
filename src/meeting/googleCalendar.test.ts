import { afterEach, describe, expect, it } from 'vitest';
import {
  CALENDAR_API_DISABLED,
  calendarApiLibraryUrl,
  calendarError,
  calendarWindow,
  eventDurationMinutes,
  eventStartsAt,
  listGoogleEvents,
  meetingFromGoogleEvent,
  retractGoogleEvent,
  roomIdFromEvent,
  SYNC_TOKEN_EXPIRED,
  updateGoogleEvent,
  type GoogleCalendarEvent,
} from './googleCalendar';
import type { Meeting } from './types';

const timed: GoogleCalendarEvent = {
  id: 'evt-1',
  summary: 'Standup',
  description: 'Daily',
  location: 'https://alexalghisi.github.io/collab/?room=kqz-wrtm-pfa',
  start: { dateTime: '2026-09-16T09:00:00.000Z' },
  end: { dateTime: '2026-09-16T09:30:00.000Z' },
};

describe('google calendar mapping', () => {
  it('turns a timed Google event into a Collab meeting and keeps the invite room', () => {
    expect(meetingFromGoogleEvent(timed, 'fallback-room')).toEqual({
      title: 'Standup',
      roomId: 'kqz-wrtm-pfa',
      startsAt: Date.parse('2026-09-16T09:00:00.000Z'),
      durationMinutes: 30,
      description: 'Daily',
      googleEventId: 'evt-1',
      fromGoogle: true,
    });
  });

  it('skips cancelled events and events without a start', () => {
    expect(meetingFromGoogleEvent({ ...timed, status: 'cancelled' }, 'room')).toBeNull();
    expect(meetingFromGoogleEvent({ id: 'x', summary: 'Nope' }, 'room')).toBeNull();
  });

  it('uses a fallback room and Busy when Google left those fields empty', () => {
    const draft = meetingFromGoogleEvent(
      {
        id: 'evt-2',
        start: { dateTime: '2026-09-16T10:00:00.000Z' },
        end: { dateTime: '2026-09-16T11:00:00.000Z' },
      },
      'new-room',
    );
    expect(draft?.title).toBe('Busy');
    expect(draft?.roomId).toBe('new-room');
  });

  it('reads all-day bounds and a room id buried in the description', () => {
    const event: GoogleCalendarEvent = {
      id: 'all-day',
      start: { date: '2026-09-16' },
      end: { date: '2026-09-17' },
      description: 'Join: https://example.com/?room=abc-defg-hij',
    };
    expect(eventStartsAt(event)).toBe(Date.parse('2026-09-16'));
    expect(eventDurationMinutes(event, Date.parse('2026-09-16'))).toBe(24 * 60);
    expect(roomIdFromEvent(event)).toBe('abc-defg-hij');
  });

  it('asks Google for the last month through the next year', () => {
    const window = calendarWindow(Date.parse('2026-09-16T12:00:00.000Z'));
    expect(window.timeMin).toBe('2026-08-17T12:00:00.000Z');
    expect(window.timeMax).toBe('2027-09-16T12:00:00.000Z');
  });

  it('points the OAuth project at the Calendar API library page', () => {
    expect(
      calendarApiLibraryUrl(
        '560742571865-eqeojukg2kqm2gmaumm79n2606e75pus.apps.googleusercontent.com',
      ),
    ).toBe(
      'https://console.cloud.google.com/apis/library/calendar.googleapis.com?project=560742571865',
    );
  });

  it('explains a missing Calendar API so Connect is not mistaken for a bad token', () => {
    expect(calendarError(403, { error: { errors: [{ reason: 'accessNotConfigured' }] } })).toBe(
      CALENDAR_API_DISABLED,
    );
  });

  it('refuses to list events when the project has not enabled the Calendar API', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { errors: [{ reason: 'accessNotConfigured' }] } }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    await expect(
      listGoogleEvents(
        'ya29.token',
        { window: calendarWindow(Date.parse('2026-09-16T12:00:00.000Z')) },
        fetchImpl,
      ),
    ).rejects.toThrow(CALENDAR_API_DISABLED);
  });
});

describe('google calendar sync protocol', () => {
  const window = calendarWindow(Date.parse('2026-09-16T12:00:00.000Z'));

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('asks for a bounded window and keeps the token Google hands back', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (input: string) => {
      urls.push(input);
      return respond({ items: [timed], nextSyncToken: 'tok-1' });
    }) as unknown as typeof fetch;

    const page = await listGoogleEvents('ya29.token', { window }, fetchImpl);

    expect(page).toEqual({ events: [timed], nextSyncToken: 'tok-1' });
    const params = new URL(urls[0]).searchParams;
    expect(params.get('timeMin')).toBe(window.timeMin);
    expect(params.get('timeMax')).toBe(window.timeMax);
    expect(params.get('orderBy')).toBe('startTime');
    expect(params.get('showDeleted')).toBe('true');
    expect(params.get('syncToken')).toBeNull();
  });

  it('sends only the sync token on an incremental run', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (input: string) => {
      urls.push(input);
      return respond({ items: [], nextSyncToken: 'tok-2' });
    }) as unknown as typeof fetch;

    await listGoogleEvents('ya29.token', { syncToken: 'tok-1' }, fetchImpl);

    const params = new URL(urls[0]).searchParams;
    expect(params.get('syncToken')).toBe('tok-1');
    expect(params.get('timeMin')).toBeNull();
    expect(params.get('timeMax')).toBeNull();
    expect(params.get('orderBy')).toBeNull();
  });

  it('follows every page and returns the token from the last one', async () => {
    const pages = [
      { items: [timed], nextPageToken: 'page-2' },
      { items: [{ ...timed, id: 'evt-2' }], nextSyncToken: 'tok-3' },
    ];
    const seen: string[] = [];
    const fetchImpl = (async (input: string) => {
      seen.push(new URL(input).searchParams.get('pageToken') ?? '');
      return respond(pages.shift());
    }) as unknown as typeof fetch;

    const page = await listGoogleEvents('ya29.token', { window }, fetchImpl);

    expect(seen).toEqual(['', 'page-2']);
    expect(page.events.map((event) => event.id)).toEqual(['evt-1', 'evt-2']);
    expect(page.nextSyncToken).toBe('tok-3');
  });

  it('reports an expired sync token so the caller can start over', async () => {
    const fetchImpl = (async () => respond({ error: { message: 'gone' } }, 410)) as typeof fetch;

    await expect(listGoogleEvents('ya29.token', { syncToken: 'stale' }, fetchImpl)).rejects.toThrow(
      SYNC_TOKEN_EXPIRED,
    );
  });
});

describe('pushing a Collab edit back to Google', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const meeting: Meeting = {
    id: 'm1',
    title: 'Weekly sync',
    roomId: 'kqz-wrtm-pfa',
    startsAt: Date.parse('2026-09-16T09:00:00.000Z'),
    durationMinutes: 45,
    description: 'Agenda and notes',
    createdAt: 0,
    googleEventId: 'evt-1',
    fromGoogle: true,
  };
  const inviteLink = 'https://alexalghisi.github.io/collab/?room=kqz-wrtm-pfa';

  it('PATCHes the linked event with the new time, date and text', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    global.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 'evt-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const id = await updateGoogleEvent('ya29.token', meeting, inviteLink);

    expect(id).toBe('evt-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe('PATCH');
    expect(calls[0].url).toContain('/events/evt-1');
    const body = JSON.parse(String(calls[0].init.body)) as {
      summary: string;
      description: string;
      location: string;
      start: { dateTime: string };
      end: { dateTime: string };
    };
    expect(body.summary).toBe('Weekly sync');
    expect(body.location).toBe(inviteLink);
    expect(body.description).toContain('Agenda and notes');
    expect(body.description).toContain(`Join: ${inviteLink}`);
    expect(body.start.dateTime).toBe(new Date(meeting.startsAt).toISOString());
    expect(body.end.dateTime).toBe(
      new Date(meeting.startsAt + meeting.durationMinutes * 60_000).toISOString(),
    );
  });

  it('refuses to patch a meeting that was never linked to a Google event', async () => {
    await expect(
      updateGoogleEvent('ya29.token', { ...meeting, googleEventId: undefined }, inviteLink),
    ).rejects.toThrow(/not linked/i);
  });

  it('surfaces an expired Google session instead of silently failing', async () => {
    global.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'nope' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    await expect(updateGoogleEvent('ya29.token', meeting, inviteLink)).rejects.toThrow(
      'Google Calendar access expired. Connect it again.',
    );
  });
});

describe('retracting a Collab meeting from Google', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const meeting: Meeting = {
    id: 'm1',
    title: 'Weekly sync',
    roomId: 'kqz-wrtm-pfa',
    startsAt: Date.parse('2026-09-16T09:00:00.000Z'),
    durationMinutes: 45,
    description: 'Agenda and notes',
    createdAt: 0,
    googleEventId: 'evt-1',
    fromGoogle: true,
  };

  const captureDelete = () => {
    const calls: { url: string; init: RequestInit }[] = [];
    global.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    return calls;
  };

  it('DELETEs the linked event even when the meeting was imported from Google', async () => {
    const calls = captureDelete();

    await retractGoogleEvent('ya29.token', meeting);

    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe('DELETE');
    expect(calls[0].url).toContain('/events/evt-1');
    expect(calls[0].init.headers).toEqual({ Authorization: 'Bearer ya29.token' });
  });

  it('does not call Google when the meeting has no googleEventId', async () => {
    const calls = captureDelete();

    await retractGoogleEvent('ya29.token', {
      ...meeting,
      googleEventId: undefined,
      fromGoogle: false,
    });

    expect(calls).toHaveLength(0);
  });

  it('treats a 404 from Google as already gone', async () => {
    global.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch;

    await expect(retractGoogleEvent('ya29.token', meeting)).resolves.toBeUndefined();
  });

  it('surfaces an expired Google session instead of silently failing', async () => {
    global.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'nope' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    await expect(retractGoogleEvent('ya29.token', meeting)).rejects.toThrow(
      'Google Calendar access expired. Connect it again.',
    );
  });
});
