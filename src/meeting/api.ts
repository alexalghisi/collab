import { ACCOUNTS_URL, AuthError } from '../auth/api';
import type { Meeting, MeetingDraft } from './types';

/** Meetings live beside the accounts, so the calendar is shared by everyone invited. */
const MEETINGS_URL = `${ACCOUNTS_URL}/meetings`;

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${MEETINGS_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new AuthError('Could not reach the meeting service.', null);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const body = (await response.json().catch(() => ({}))) as { error?: unknown } & T;
  if (!response.ok) {
    throw new AuthError(
      typeof body.error === 'string' ? body.error : 'The calendar could not be reached.',
      response.status,
    );
  }
  return body;
}

export async function fetchMeetings(token: string): Promise<Meeting[]> {
  const { meetings } = await call<{ meetings: Meeting[] }>('', token);
  return meetings;
}

export async function createMeeting(token: string, draft: MeetingDraft): Promise<Meeting> {
  const { meeting } = await call<{ meeting: Meeting }>('', token, {
    method: 'POST',
    body: JSON.stringify(draft),
  });
  return meeting;
}

export function cancelMeeting(token: string, meetingId: string): Promise<void> {
  return call<void>(`/${encodeURIComponent(meetingId)}`, token, { method: 'DELETE' });
}
