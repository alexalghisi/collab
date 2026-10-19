import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { requestGoogleCalendarToken } from '../auth/googleWeb';
import { readGoogleWebClientId } from '../auth/config';
import { buildInviteLink } from './invite';
import { generateRoomId } from './roomId';
import { CALENDAR_LIVE_SYNC_INTERVAL_MS, runCalendarLiveSync } from './calendarLiveSync';
import {
  readGoogleCalendarConnected,
  readGoogleCalendarSyncToken,
  readGoogleCalendarToken,
  writeGoogleCalendarConnected,
  writeGoogleCalendarSyncToken,
  writeGoogleCalendarToken,
} from './googleCalendarStore';
import {
  calendarWindow,
  insertGoogleEvent,
  isGoogleUnauthorized,
  listGoogleEvents,
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
  /** Connected, but live sync waits for a click because Google access expired. */
  readonly paused: boolean;
  readonly error: string | null;
  connect: () => Promise<void>;
  sync: () => Promise<void>;
  disconnect: () => void;
  publish: (meeting: Meeting) => Promise<Meeting>;
  update: (meeting: Meeting) => Promise<Meeting>;
  shareGuests: (meeting: Meeting) => Promise<Meeting>;
  retract: (meeting: Meeting) => Promise<void>;
}

const RESUME_HINT = 'Google Calendar access expired. Click "Sync now" to resume live sync.';
const NEEDS_CLICK = 'collab.google-calendar.needs-click';

export function useGoogleCalendar(uid: string, meetings: MeetingsState): GoogleCalendarSync {
  const available = Platform.OS === 'web' && Boolean(readGoogleWebClientId());
  const [connected, setConnected] = useState(() => readGoogleCalendarConnected(uid));
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  // Bumped after every successful interactive token request, so the polling
  // loop (re)starts even if it had stopped for want of a token.
  const [pollKey, setPollKey] = useState(0);
  const tokenRef = useRef<string | null>(readGoogleCalendarToken(uid));
  const syncTokenRef = useRef<string | null>(readGoogleCalendarSyncToken(uid));
  const haltRef = useRef(false);
  const flightRef = useRef<Promise<void> | null>(null);
  const flightEpochRef = useRef<number | null>(null);
  const epochRef = useRef(0);
  const meetingsRef = useRef(meetings);
  meetingsRef.current = meetings;

  useEffect(() => {
    tokenRef.current = readGoogleCalendarToken(uid);
    syncTokenRef.current = readGoogleCalendarSyncToken(uid);
    setConnected(readGoogleCalendarConnected(uid));
    setError(null);
    setPaused(false);
    haltRef.current = false;
  }, [uid]);

  const rememberToken = useCallback(
    (value: string | null) => {
      tokenRef.current = value;
      writeGoogleCalendarToken(uid, value);
    },
    [uid],
  );

  const writeSyncToken = useCallback(
    (value: string | null) => {
      syncTokenRef.current = value;
      writeGoogleCalendarSyncToken(uid, value);
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

  const runGuarded = useCallback(
    async (accessToken: string, epoch: number, interactive: boolean) => {
      if (haltRef.current || flightRef.current) {
        return;
      }
      let resolveFlight: () => void = () => undefined;
      const flight = new Promise<void>((resolve) => {
        resolveFlight = resolve;
      });
      flightRef.current = flight;
      flightEpochRef.current = epoch;
      setSyncing(true);
      try {
        const result = await runCalendarLiveSync({
          connected: true,
          accessToken,
          syncToken: syncTokenRef.current,
          meetings: meetingsRef.current.meetings,
          window: calendarWindow(),
          fallbackRoomId: generateRoomId,
          listEvents: listGoogleEvents,
          applyGoogle: (drafts) => meetingsRef.current.applyGoogle(drafts),
          removeMeeting: (id) => meetingsRef.current.remove(id),
          pushLocal,
          writeSyncToken,
          rememberToken,
          // A background poll has no click to open Google's window with, so
          // it pauses instead; the next "Sync now" click gets a fresh token.
          requestSilentToken: interactive
            ? () => token('')
            : () => Promise.reject(new Error(NEEDS_CLICK)),
        });
        if (result.stopped) {
          // Stay connected: one click on "Sync now" resumes live sync.
          haltRef.current = true;
          setPaused(true);
          setError(!interactive || result.error === NEEDS_CLICK ? RESUME_HINT : result.error);
          return;
        }
        if (epochRef.current !== epoch) {
          return;
        }
        setError(result.error);
      } finally {
        if (flightRef.current === flight) {
          flightRef.current = null;
        }
        resolveFlight();
        setSyncing(false);
      }
    },
    [pushLocal, rememberToken, token, uid, writeSyncToken],
  );

  const runGuardedRef = useRef(runGuarded);
  runGuardedRef.current = runGuarded;

  useEffect(() => {
    if (!connected || !readGoogleCalendarConnected(uid) || !tokenRef.current) {
      return;
    }
    const epoch = epochRef.current;
    let pending = false;
    const kick = () => {
      if (epochRef.current !== epoch || haltRef.current) {
        return;
      }
      const accessToken = tokenRef.current;
      if (!accessToken) {
        return;
      }
      const inflight = flightRef.current;
      if (inflight) {
        if (pending) {
          return;
        }
        pending = true;
        const inflightEpoch = flightEpochRef.current;
        void inflight.then(() => {
          pending = false;
          if (epochRef.current !== epoch || inflightEpoch === epoch) {
            return;
          }
          kick();
        });
        return;
      }
      void runGuardedRef.current(accessToken, epoch, false);
    };
    kick();
    const timer = setInterval(kick, CALENDAR_LIVE_SYNC_INTERVAL_MS);
    // Pull right away when the person comes back to the tab.
    const onVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        kick();
      }
    };
    const canListen = Platform.OS === 'web' && typeof window !== 'undefined';
    if (canListen) {
      window.addEventListener('focus', onVisible);
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      epochRef.current += 1;
      clearInterval(timer);
      if (canListen) {
        window.removeEventListener('focus', onVisible);
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, [connected, uid, pollKey]);

  const connect = useCallback(async () => {
    setError(null);
    setPaused(false);
    haltRef.current = false;
    setSyncing(true);
    try {
      const accessToken = await token('consent');
      writeGoogleCalendarConnected(uid, true);
      setConnected(true);
      await runGuarded(accessToken, epochRef.current, true);
      setPollKey((key) => key + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect Google Calendar.');
    } finally {
      setSyncing(false);
    }
  }, [runGuarded, token, uid]);

  const sync = useCallback(async () => {
    if (!connected) {
      return;
    }
    setError(null);
    try {
      // Get a token first, while the click still allows opening Google's window.
      const accessToken = tokenRef.current ?? (await token(''));
      const inflight = flightRef.current;
      if (inflight) {
        await inflight;
      }
      haltRef.current = false;
      setPaused(false);
      await runGuarded(tokenRef.current ?? accessToken, epochRef.current, true);
      // (Re)start continuous polling of Google Calendar.
      setPollKey((key) => key + 1);
    } catch (cause) {
      forgetExpiredToken(cause);
      setError(cause instanceof Error ? cause.message : 'Could not sync Google Calendar.');
    }
  }, [connected, forgetExpiredToken, runGuarded, token]);

  const disconnect = useCallback(() => {
    rememberToken(null);
    writeGoogleCalendarConnected(uid, false);
    setConnected(false);
    setPaused(false);
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

  const shareGuests = useCallback(
    async (meeting: Meeting) => {
      try {
        const accessToken = tokenRef.current ?? (await token('consent'));
        writeGoogleCalendarConnected(uid, true);
        setConnected(true);
        const eventId = meeting.googleEventId
          ? await updateGoogleEvent(accessToken, meeting, buildInviteLink(meeting.roomId))
          : await insertGoogleEvent(accessToken, meeting, buildInviteLink(meeting.roomId));
        const next = { ...meeting, googleEventId: eventId };
        await meetingsRef.current.save(next);
        return next;
      } catch (cause) {
        forgetExpiredToken(cause);
        setError(cause instanceof Error ? cause.message : 'Could not mail the guests.');
        throw cause;
      }
    },
    [forgetExpiredToken, token, uid],
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
    paused,
    error,
    connect,
    sync,
    disconnect,
    publish,
    update,
    shareGuests,
    retract,
  };
}
