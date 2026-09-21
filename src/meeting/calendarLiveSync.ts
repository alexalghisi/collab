import { isGoogleUnauthorized, SYNC_TOKEN_EXPIRED } from './googleCalendar';
import type { CalendarPage, CalendarQuery, CalendarWindow } from './googleCalendar';
import { reconcileGoogleCalendar } from './reconcileGoogleCalendar';
import type { Meeting, MeetingDraft } from './types';

export const CALENDAR_LIVE_SYNC_INTERVAL_MS = 30_000;

const ACCESS_EXPIRED = 'Google Calendar access expired. Connect it again.';

export interface CalendarLiveSyncOutcome {
  readonly stopped: boolean;
  readonly error: string | null;
}

export interface CalendarLiveSyncCycle {
  readonly connected: boolean;
  readonly accessToken: string | null;
  readonly syncToken: string | null;
  readonly meetings: readonly Meeting[];
  readonly window: CalendarWindow;
  readonly fallbackRoomId: () => string;
  listEvents: (token: string, query: CalendarQuery) => Promise<CalendarPage>;
  applyGoogle: (drafts: MeetingDraft[]) => Promise<void>;
  removeMeeting: (id: string) => Promise<void>;
  pushLocal: (token: string) => Promise<void>;
  writeSyncToken: (token: string | null) => void;
  rememberToken: (token: string | null) => void;
  requestSilentToken: () => Promise<string>;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Could not sync Google Calendar.';
}

function isSyncTokenExpired(cause: unknown): boolean {
  return cause instanceof Error && cause.message === SYNC_TOKEN_EXPIRED;
}

function isAuthExpired(cause: unknown): boolean {
  return (
    isGoogleUnauthorized(cause) || (cause instanceof Error && cause.message === ACCESS_EXPIRED)
  );
}

async function pullOnce(
  input: CalendarLiveSyncCycle,
  accessToken: string,
  syncToken: string | null,
  writeSyncToken: (token: string | null) => void,
): Promise<void> {
  let fullWindow = syncToken === null;
  let page: CalendarPage;
  try {
    page = await input.listEvents(
      accessToken,
      syncToken === null ? { window: input.window } : { syncToken },
    );
  } catch (cause) {
    if (syncToken === null || !isSyncTokenExpired(cause)) {
      throw cause;
    }
    writeSyncToken(null);
    fullWindow = true;
    page = await input.listEvents(accessToken, { window: input.window });
  }
  const reconciled = reconcileGoogleCalendar(input.meetings, page.events, {
    fullWindow,
    fallbackRoomId: input.fallbackRoomId,
  });
  await input.applyGoogle(reconciled.upserts);
  for (const id of reconciled.removeIds) {
    await input.removeMeeting(id);
  }
  await input.pushLocal(accessToken);
  writeSyncToken(page.nextSyncToken);
}

export async function runCalendarLiveSync(
  input: CalendarLiveSyncCycle,
): Promise<CalendarLiveSyncOutcome> {
  if (!input.connected || !input.accessToken) {
    return { stopped: false, error: null };
  }
  let accessToken = input.accessToken;
  let syncToken = input.syncToken;
  let retried = false;
  const writeSyncToken = (value: string | null) => {
    syncToken = value;
    input.writeSyncToken(value);
  };
  for (;;) {
    try {
      await pullOnce(input, accessToken, syncToken, writeSyncToken);
      return { stopped: false, error: null };
    } catch (cause) {
      if (!isAuthExpired(cause) || retried) {
        if (isAuthExpired(cause)) {
          input.rememberToken(null);
          return { stopped: true, error: messageOf(cause) };
        }
        return { stopped: false, error: messageOf(cause) };
      }
      retried = true;
      try {
        accessToken = await input.requestSilentToken();
      } catch (silentCause) {
        input.rememberToken(null);
        return { stopped: true, error: messageOf(silentCause) };
      }
      input.rememberToken(accessToken);
    }
  }
}
