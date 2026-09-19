import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { requestGoogleCalendarToken } from '../auth/googleWeb';
import { readGoogleWebClientId } from '../auth/config';
import { buildInviteLink } from './invite';
import { generateRoomId } from './roomId';
import { storage } from './storage';
import {
  calendarWindow,
  deleteGoogleEvent,
  insertGoogleEvent,
  listGoogleEvents,
  meetingFromGoogleEvent,
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
  retract: (meeting: Meeting) => Promise<void>;
}

const connectedKey = (uid: string) => `collab.googleCalendar.${uid}`;

function readConnected(uid: string): boolean {
  try {
    return storage.read(connectedKey(uid)) === '1';
  } catch {
    return false;
  }
}

function writeConnected(uid: string, connected: boolean): void {
  try {
    storage.write(connectedKey(uid), connected ? '1' : '');
  } catch {
    return;
  }
}

export function useGoogleCalendar(uid: string, meetings: MeetingsState): GoogleCalendarSync {
  const available = Platform.OS === 'web' && Boolean(readGoogleWebClientId());
  const [connected, setConnected] = useState(() => readConnected(uid));
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const meetingsRef = useRef(meetings);
  meetingsRef.current = meetings;

  useEffect(() => {
    tokenRef.current = null;
    setConnected(readConnected(uid));
    setError(null);
  }, [uid]);

  const token = useCallback(async (prompt: '' | 'consent') => {
    const next = await requestGoogleCalendarToken(prompt);
    tokenRef.current = next;
    return next;
  }, []);

  const pull = useCallback(async (accessToken: string) => {
    const events = await listGoogleEvents(accessToken, calendarWindow());
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
      const accessToken = await token('');
      writeConnected(uid, true);
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
      tokenRef.current = null;
      setError(cause instanceof Error ? cause.message : 'Could not sync Google Calendar.');
    } finally {
      setSyncing(false);
    }
  }, [connected, pull, pushLocal, token]);

  const disconnect = useCallback(() => {
    tokenRef.current = null;
    writeConnected(uid, false);
    setConnected(false);
    setError(null);
  }, [uid]);

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
        setError(cause instanceof Error ? cause.message : 'Could not add this meeting to Google.');
        return meeting;
      }
    },
    [connected, token],
  );

  const retract = useCallback(
    async (meeting: Meeting) => {
      if (!meeting.googleEventId || meeting.fromGoogle) {
        return;
      }
      try {
        const accessToken = tokenRef.current ?? (await token(''));
        await deleteGoogleEvent(accessToken, meeting.googleEventId);
      } catch {
        return;
      }
    },
    [token],
  );

  return { available, connected, syncing, error, connect, sync, disconnect, publish, retract };
}
