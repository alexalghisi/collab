import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { requestGoogleCalendarCode, requestGoogleCalendarToken } from '../auth/googleWeb';
import {
  CALENDAR_NOT_CONNECTED,
  calendarServerStatus,
  connectCalendarOnServer,
  disconnectCalendarOnServer,
  refreshCalendarOnServer,
} from './calendarServer';
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
const RECONNECT_ONCE =
  'Connect Google Calendar once more: from then on it stays in sync permanently, on every device.';

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
  // Server keeps a refresh token (connect once, synced for good). null = not known yet.
  const [serverMode, setServerMode] = useState<boolean | null>(null);
  const serverModeRef = useRef<boolean | null>(null);
  serverModeRef.current = serverMode;
  // When the current access token must be renewed (0 = unknown: renew before use).
  const expiresAtRef = useRef(0);
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
    expiresAtRef.current = 0;
  }, [uid]);

  // Does the server hold this account's Google Calendar grant? Then sync needs no clicks,
  // and an account connected on another device is connected here too.
  useEffect(() => {
    if (!available) {
      return;
    }
    let cancelled = false;
    void calendarServerStatus().then((status) => {
      if (cancelled) {
        return;
      }
      setServerMode(status.configured);
      if (status.configured && status.connected && !readGoogleCalendarConnected(uid)) {
        writeGoogleCalendarConnected(uid, true);
        setConnected(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [available, uid]);

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
      if (serverModeRef.current) {
        if (prompt === 'consent') {
          const granted = await requestGoogleCalendarCode();
          if (granted) {
            const access = await connectCalendarOnServer(granted.code, granted.redirectUri);
            expiresAtRef.current = access.expiresAt;
            rememberToken(access.accessToken);
            return access.accessToken;
          }
        } else {
          // Silent renewal from the server's refresh token: no popup, no click.
          const access = await refreshCalendarOnServer();
          expiresAtRef.current = access.expiresAt;
          rememberToken(access.accessToken);
          return access.accessToken;
        }
      }
      const next = await requestGoogleCalendarToken(prompt);
      expiresAtRef.current = Date.now() + 55 * 60_000;
      rememberToken(next);
      return next;
    },
    [rememberToken],
  );

  /** The current access token, renewed through the server when it is about to expire. */
  const freshToken = useCallback(async (): Promise<string | null> => {
    if (!serverModeRef.current) {
      return tokenRef.current;
    }
    if (tokenRef.current && Date.now() < expiresAtRef.current) {
      return tokenRef.current;
    }
    try {
      return await token('');
    } catch (cause) {
      if (cause instanceof Error && cause.message === CALENDAR_NOT_CONNECTED) {
        // Connected before the permanent grant existed: one last click upgrades it.
        haltRef.current = true;
        setPaused(true);
        setError(RECONNECT_ONCE);
      }
      return null;
    }
  }, [token]);
  const freshTokenRef = useRef(freshToken);
  freshTokenRef.current = freshToken;

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
          requestSilentToken:
            interactive || serverModeRef.current
              ? () => token('')
              : () => Promise.reject(new Error(NEEDS_CLICK)),
        });
        if (result.stopped && serverModeRef.current && result.error !== CALENDAR_NOT_CONNECTED) {
          // Server mode never needs a click: a transient Google error is retried next tick.
          setError(null);
          return;
        }
        if (result.stopped) {
          // Stay connected: one click on "Sync now" resumes live sync.
          haltRef.current = true;
          setPaused(true);
          setError(
            result.error === CALENDAR_NOT_CONNECTED
              ? RECONNECT_ONCE
              : !interactive || result.error === NEEDS_CLICK
                ? RESUME_HINT
                : result.error,
          );
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
    if (
      !connected ||
      !readGoogleCalendarConnected(uid) ||
      serverMode === null ||
      (!serverMode && !tokenRef.current)
    ) {
      return;
    }
    const epoch = epochRef.current;
    let pending = false;
    const kick = () => {
      if (epochRef.current !== epoch || haltRef.current) {
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
      void freshTokenRef.current().then((accessToken) => {
        if (accessToken && epochRef.current === epoch) {
          void runGuardedRef.current(accessToken, epoch, false);
        }
      });
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
  }, [connected, uid, pollKey, serverMode]);

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
      const accessToken =
        (await freshToken()) ?? (await token(serverModeRef.current ? 'consent' : ''));
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
  }, [connected, forgetExpiredToken, freshToken, runGuarded, token]);

  const disconnect = useCallback(() => {
    if (serverModeRef.current) {
      void disconnectCalendarOnServer();
    }
    expiresAtRef.current = 0;
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
        const accessToken = (await freshToken()) ?? (await token(''));
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
    [connected, forgetExpiredToken, freshToken, token],
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
        const accessToken = (await freshToken()) ?? (await token(''));
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
    [connected, forgetExpiredToken, freshToken, token],
  );

  const shareGuests = useCallback(
    async (meeting: Meeting) => {
      try {
        const accessToken = (await freshToken()) ?? (await token('consent'));
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
    [forgetExpiredToken, freshToken, token, uid],
  );

  const retract = useCallback(
    async (meeting: Meeting) => {
      if (!connected || !meeting.googleEventId) {
        return;
      }
      try {
        await retractCalendarMeeting(
          meeting,
          await freshToken(),
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
    [connected, forgetExpiredToken, freshToken, rememberToken, token],
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
