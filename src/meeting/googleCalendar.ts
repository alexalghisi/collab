import { meetingEndsAt, type Meeting, type MeetingDraft } from './types';

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const ROOM_IN_TEXT = /(?:\?|&)room=([a-z0-9-]+)/i;

export interface CalendarWindow {
  readonly timeMin: string;
  readonly timeMax: string;
}

export type CalendarQuery = { readonly window: CalendarWindow } | { readonly syncToken: string };

export interface CalendarPage {
  readonly events: GoogleCalendarEvent[];
  readonly nextSyncToken: string | null;
}

export const SYNC_TOKEN_EXPIRED = 'Google Calendar asked for a full resync.';

export interface GoogleCalendarEvent {
  readonly id?: string;
  readonly status?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly location?: string;
  readonly start?: { readonly dateTime?: string; readonly date?: string };
  readonly end?: { readonly dateTime?: string; readonly date?: string };
}

interface CalendarErrorBody {
  readonly error?: {
    readonly message?: string;
    readonly errors?: ReadonlyArray<{ readonly reason?: string }>;
  };
}

export function calendarWindow(now = Date.now()): CalendarWindow {
  const past = new Date(now);
  past.setUTCDate(past.getUTCDate() - 30);
  const future = new Date(now);
  future.setUTCFullYear(future.getUTCFullYear() + 1);
  return { timeMin: past.toISOString(), timeMax: future.toISOString() };
}

export function eventStartsAt(event: GoogleCalendarEvent): number | null {
  const value = event.start?.dateTime ?? event.start?.date;
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function eventDurationMinutes(event: GoogleCalendarEvent, startsAt: number): number {
  const value = event.end?.dateTime ?? event.end?.date;
  if (!value) {
    return 60;
  }
  const endsAt = Date.parse(value);
  if (!Number.isFinite(endsAt) || endsAt <= startsAt) {
    return 60;
  }
  return Math.max(15, Math.round((endsAt - startsAt) / 60_000));
}

export function roomIdFromEvent(event: GoogleCalendarEvent): string | null {
  const blob = `${event.location ?? ''}\n${event.description ?? ''}`;
  const match = blob.match(ROOM_IN_TEXT);
  return match?.[1] ?? null;
}

export function meetingFromGoogleEvent(
  event: GoogleCalendarEvent,
  fallbackRoomId: string,
): MeetingDraft | null {
  if (!event.id || event.status === 'cancelled') {
    return null;
  }
  const startsAt = eventStartsAt(event);
  if (startsAt === null) {
    return null;
  }
  const title = (event.summary ?? '').trim();
  return {
    title: title === '' ? 'Busy' : title,
    roomId: roomIdFromEvent(event) ?? fallbackRoomId,
    startsAt,
    durationMinutes: eventDurationMinutes(event, startsAt),
    description: (event.description ?? '').trim(),
    googleEventId: event.id,
    fromGoogle: true,
  };
}

export const CALENDAR_API_DISABLED =
  'Enable the Google Calendar API in Google Cloud Console for this OAuth client.';

export function calendarApiLibraryUrl(clientId: string): string {
  const project = clientId.split('-')[0] ?? '';
  return `https://console.cloud.google.com/apis/library/calendar.googleapis.com?project=${project}`;
}

export function calendarError(status: number, body: CalendarErrorBody): string {
  const reason = body.error?.errors?.[0]?.reason;
  if (status === 403 && reason === 'accessNotConfigured') {
    return CALENDAR_API_DISABLED;
  }
  if (status === 401 || status === 403) {
    return 'Google Calendar access expired. Connect it again.';
  }
  return typeof body.error?.message === 'string'
    ? body.error.message
    : 'Could not reach Google Calendar.';
}

async function readError(response: Response): Promise<CalendarErrorBody> {
  return (await response.json().catch(() => ({}))) as CalendarErrorBody;
}

function queryParams(query: CalendarQuery): URLSearchParams {
  const params = new URLSearchParams({
    singleEvents: 'true',
    showDeleted: 'true',
    maxResults: '250',
  });
  if ('syncToken' in query) {
    params.set('syncToken', query.syncToken);
    return params;
  }
  params.set('orderBy', 'startTime');
  params.set('timeMin', query.window.timeMin);
  params.set('timeMax', query.window.timeMax);
  return params;
}

export async function listGoogleEvents(
  token: string,
  query: CalendarQuery,
  fetchImpl: typeof fetch = fetch,
): Promise<CalendarPage> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken = '';
  let nextSyncToken: string | null = null;
  do {
    const params = queryParams(query);
    if (pageToken) {
      params.set('pageToken', pageToken);
    }
    const response = await fetchImpl(`${EVENTS_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json().catch(() => ({}))) as CalendarErrorBody & {
      readonly items?: GoogleCalendarEvent[];
      readonly nextPageToken?: string;
      readonly nextSyncToken?: string;
    };
    if (response.status === 410) {
      throw new Error(SYNC_TOKEN_EXPIRED);
    }
    if (!response.ok) {
      throw new Error(calendarError(response.status, body));
    }
    events.push(...(body.items ?? []));
    nextSyncToken = body.nextSyncToken ?? nextSyncToken;
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return { events, nextSyncToken };
}

export async function insertGoogleEvent(
  token: string,
  meeting: Meeting,
  inviteLink: string,
): Promise<string> {
  const response = await fetch(EVENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: meeting.title,
      description: [meeting.description, `Join: ${inviteLink}`].filter(Boolean).join('\n\n'),
      location: inviteLink,
      start: { dateTime: new Date(meeting.startsAt).toISOString() },
      end: { dateTime: new Date(meetingEndsAt(meeting)).toISOString() },
      extendedProperties: { private: { collabMeetingId: meeting.id } },
    }),
  });
  const body = (await response.json().catch(() => ({}))) as CalendarErrorBody & {
    readonly id?: string;
  };
  if (!response.ok || typeof body.id !== 'string') {
    throw new Error(calendarError(response.status, body));
  }
  return body.id;
}

/**
 * Pushes a local edit (time, date, title or description) back to the Google
 * event it came from. Uses PATCH so fields Collab does not manage — attendees,
 * conferencing, reminders — are left untouched on the Google side.
 */
export async function updateGoogleEvent(
  token: string,
  meeting: Meeting,
  inviteLink: string,
): Promise<string> {
  if (!meeting.googleEventId) {
    throw new Error('This meeting is not linked to a Google Calendar event.');
  }
  const response = await fetch(`${EVENTS_URL}/${encodeURIComponent(meeting.googleEventId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: meeting.title,
      description: [meeting.description, `Join: ${inviteLink}`].filter(Boolean).join('\n\n'),
      location: inviteLink,
      start: { dateTime: new Date(meeting.startsAt).toISOString() },
      end: { dateTime: new Date(meetingEndsAt(meeting)).toISOString() },
    }),
  });
  const body = (await response.json().catch(() => ({}))) as CalendarErrorBody & {
    readonly id?: string;
  };
  if (!response.ok || typeof body.id !== 'string') {
    throw new Error(calendarError(response.status, body));
  }
  return body.id;
}

export async function deleteGoogleEvent(token: string, eventId: string): Promise<void> {
  const response = await fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 204 || response.status === 404 || response.status === 410) {
    return;
  }
  if (!response.ok) {
    throw new Error(calendarError(response.status, await readError(response)));
  }
}

export async function retractGoogleEvent(token: string, meeting: Meeting): Promise<void> {
  if (!meeting.googleEventId) {
    return;
  }
  await deleteGoogleEvent(token, meeting.googleEventId);
}
