import {
  cancelledEventIds,
  meetingFromGoogleEvent,
  SYNC_TOKEN_EXPIRED,
  type CalendarPage,
  type CalendarQuery,
  type CalendarWindow,
} from './googleCalendar';
import type { MeetingDraft } from './types';

export interface CalendarPullDeps {
  readonly list: (query: CalendarQuery) => Promise<CalendarPage>;
  readonly apply: (drafts: MeetingDraft[], cancelledIds: string[]) => Promise<void>;
  readonly roomId: () => string;
  readonly window: () => CalendarWindow;
}

export async function pullGoogleCalendar(
  deps: CalendarPullDeps,
  syncToken: string | null,
): Promise<string | null> {
  const page = await readPage(deps, syncToken);
  const drafts = page.events
    .map((event) => meetingFromGoogleEvent(event, deps.roomId()))
    .filter((draft): draft is MeetingDraft => draft !== null);

  await deps.apply(drafts, cancelledEventIds(page.events));
  return page.nextSyncToken;
}

async function readPage(deps: CalendarPullDeps, syncToken: string | null): Promise<CalendarPage> {
  if (syncToken === null) {
    return deps.list({ window: deps.window() });
  }
  try {
    return await deps.list({ syncToken });
  } catch (cause) {
    if (cause instanceof Error && cause.message === SYNC_TOKEN_EXPIRED) {
      return deps.list({ window: deps.window() });
    }
    throw cause;
  }
}
