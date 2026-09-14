import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthError } from '../auth/api';
import type { AuthSession } from '../auth/types';
import { cancelMeeting, createMeeting, fetchMeetings } from './api';
import type { Meeting, MeetingDraft } from './types';

/** Somebody else may schedule with you while the app is open. */
const REFRESH_MS = 30_000;

export interface MeetingsState {
  readonly meetings: Meeting[];
  readonly error: string | null;
  schedule: (draft: MeetingDraft) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Adds an instant meeting to the history unless the room is already there. */
  recordInstant: (roomId: string) => Promise<void>;
  reload: () => Promise<void>;
}

const message = (cause: unknown): string =>
  cause instanceof AuthError ? cause.message : 'The calendar could not be reached.';

/**
 * The signed-in account's calendar, held by the server so a meeting appears for
 * everybody invited to it. There is no socket outside a meeting, so the list is
 * refetched after every change and on a slow timer.
 */
export function useMeetings(session: AuthSession | null): MeetingsState {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const token = session?.token ?? null;
  const meetingsRef = useRef<Meeting[]>([]);

  meetingsRef.current = meetings;

  const reload = useCallback(async () => {
    if (!token) {
      setMeetings([]);
      return;
    }
    try {
      setMeetings(await fetchMeetings(token));
      setError(null);
    } catch (cause) {
      setError(message(cause));
    }
  }, [token]);

  useEffect(() => {
    void reload();
    if (!token) {
      return;
    }
    const timer = setInterval(() => void reload(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload, token]);

  const schedule = useCallback(
    async (draft: MeetingDraft) => {
      if (!token) {
        return;
      }
      try {
        const meeting = await createMeeting(token, draft);
        setMeetings((current) => [...current, meeting]);
        setError(null);
      } catch (cause) {
        setError(message(cause));
      }
    },
    [token],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!token) {
        return;
      }
      try {
        await cancelMeeting(token, id);
        setMeetings((current) => current.filter((meeting) => meeting.id !== id));
        setError(null);
      } catch (cause) {
        setError(message(cause));
        await reload();
      }
    },
    [token, reload],
  );

  const recordInstant = useCallback(
    async (roomId: string) => {
      if (meetingsRef.current.some((meeting) => meeting.roomId === roomId)) {
        return;
      }
      await schedule({
        title: 'Instant meeting',
        roomId,
        startsAt: Date.now(),
        durationMinutes: 0,
        description: '',
        attendeeIds: [],
      });
    },
    [schedule],
  );

  return { meetings, error, schedule, remove, recordInstant, reload };
}
