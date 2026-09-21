import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { requestGoogleCalendarToken } from '../auth/googleWeb';
import { readGoogleWebClientId } from '../auth/config';
import { buildInviteLink } from './invite';
import { generateRoomId } from './roomId';
import {
  readGoogleCalendarConnected,
  readGoogleCalendarToken,
  writeGoogleCalendarConnected,
  writeGoogleCalendarToken,
} from './googleCalendarStore';
import {
  calendarWindow,
  insertGoogleEvent,
  isGoogleUnauthorized,
  listGoogleEvents,
  meetingFromGoogleEvent,
  retractCalendarMeeting,
  retractGoogleEvent,
  updateGoogleEvent,
} from './googleCalendar';
import type { MeetingsState } from './useMeetings';
import type { Meeting } from './types';

export interface GoogleCalendarSync {
  readonly available: boolean;
  readonly connected: boolean;
  readonly syncing: boolean;
  readonly error: string | null;
  connect: () => Promise<void>;
  sync: () => Promise<void>;
  disconnect: () => void;
  publish: (meeting: Meeting) => Promise<Meeting>;
  update: (meeting: Meeting) => Promise<Meeting>;
  retract: (meeting: Meeting) => Promise<void>;
}

export function useGoogleCalendar(uid: string, meetings: MeetingsState): GoogleCalendarSync {
  const available = Platform.OS === 'web' && Boolean(readGoogleWebClientId());
  const [connected, setConnected] = useState(() => readGoogleCalendarConnected(uid));
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(readGoogleCalendarToken(uid));
  const meetingsRef = useRef(meetings);
  meetingsRef.current = meetings;

  useEffect(() => {
    tokenRef.current = readGoogleCalendarToken(uid);
    setConnected(readGoogleCalendarConnected(uid));
    setError(null);
  }, [uid]);

  const rememberToken = useCallback(
    (value: string | null) => {
      tokenRef.current = value;
      writeGoogleCalendarToken(uid, value);
    },
    [uid],
  );

  const token = useCallback(
    async (prompt: '' | 'consent') => {
      const next = await requestGoogleCalendarToken(prompt);
      rememberToken(next);
      return next;
    },
    [rememberToken],
  );

  const forgetExpiredToken = useCallback(
    (cause: unknown) => {
      if (
        isGoogleUnauthorized(cause) ||
        (cause instanceof Error &&
          cause.message === 'Google Calendar access expired. Connect it again.')
      ) {
        rememberToken(null);
      }
    },
    [rememberToken],
  );

  const pull = useCallback(async (accessToken: string) => {
    const { events } = await listGoogleEvents(accessToken, { window: calendarWindow() });
    const drafts = events
      .map((event) => meetingFromGoogleEvent(event, generateRoomId()))
      .filter((draft): draft is NonNullable<typeof draft> => draft !== null);
    await meetingsRef.current.applyGoogle(drafts);
  }, []);

  const pushLocal = useCallback(async (accessToken: string) => {
    for (const meeting of meetingsRef.current.meetings) {
      if (meeting.fromGoogle || meeting.googleEventId || meeting.durationMinutes <= 0) {
        continue;
      }
      const eventId = await insertGoogleEvent(
        accessToken,
        meeting,
        buildInviteLink(meeting.roomId),
      );
      await meetingsRef.current.save({ ...meeting, googleEventId: eventId });
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setSyncing(true);
    try {
      const accessToken = await token('consent');
      writeGoogleCalendarConnected(uid, true);
      setConnected(true);
      await pull(accessToken);
      await pushLocal(accessToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect Google Calendar.');
    } finally {
      setSyncing(false);
    }
  }, [pull, pushLocal, token, uid]);

  const sync = useCallback(async () => {
    if (!connected) {
      return;
    }
    setError(null);
    setSyncing(true);
    try {
      const accessToken = tokenRef.current ?? (await token(''));
      await pull(accessToken);
      await pushLocal(accessToken);
    } catch (cause) {
      forgetExpiredToken(cause);
      setError(cause instanceof Error ? cause.message : 'Could not sync Google Calendar.');
    } finally {
      setSyncing(false);
    }
  }, [connected, forgetExpiredToken, pull, pushLocal, token]);

  const disconnect = useCallback(() => {
    rememberToken(null);
    writeGoogleCalendarConnected(uid, false);
    setConnected(false);
    setError(null);
  }, [rememberToken, uid]);

  const publish = useCallback(
    async (meeting: Meeting) => {
      if (
        !connected ||
        meeting.fromGoogle ||
        meeting.googleEventId ||
        meeting.durationMinutes <= 0
      ) {
        return meeting;
      }
      try {
        const accessToken = tokenRef.current ?? (await token(''));
        const eventId = await insertGoogleEvent(
          accessToken,
          meeting,
          buildInviteLink(meeting.roomId),
        );
        const next = { ...meeting, googleEventId: eventId };
        await meetingsRef.current.save(next);
        return next;
      } catch (cause) {
        forgetExpiredToken(cause);
        setError(cause instanceof Error ? cause.message : 'Could not add this meeting to Google.');
        return meeting;
      }
    },
    [connected, forgetExpiredToken, token],
  );

  const publishRef = useRef(publish);
  publishRef.current = publish;

  const update = useCallback(
    async (meeting: Meeting) => {
      if (!connected || meeting.durationMinutes <= 0) {
        return meeting;
      }
      // A meeting that was never pushed to Google yet is created, not patched.
      if (!meeting.googleEventId) {
        return publishRef.current(meeting);
      }
      try {
        const accessToken = tokenRef.current ?? (await token(''));
        await updateGoogleEvent(accessToken, meeting, buildInviteLink(meeting.roomId));
        return meeting;
      } catch (cause) {
        forgetExpiredToken(cause);
        setError(
          cause instanceof Error ? cause.message : 'Could not update this meeting in Google.',
        );
        return meeting;
      }
    },
    [connected, forgetExpiredToken, token],
  );

  const retract = useCallback(
    async (meeting: Meeting) => {
      if (!connected || !meeting.googleEventId) {
        return;
      }
      try {
        await retractCalendarMeeting(
          meeting,
          tokenRef.current,
          () => {
            rememberToken(null);
            return token('consent');
          },
          retractGoogleEvent,
        );
      } catch (cause) {
        forgetExpiredToken(cause);
        setError(
          cause instanceof Error ? cause.message : 'Could not delete this meeting from Google.',
        );
        throw cause;
      }
    },
    [connected, forgetExpiredToken, rememberToken, token],
  );

  return {
    available,
    connected,
    syncing,
    error,
    connect,
    sync,
    disconnect,
    publish,
    update,
    retract,
  };
}
