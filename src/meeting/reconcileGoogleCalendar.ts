import { meetingFromGoogleEvent, type GoogleCalendarEvent } from './googleCalendar';
import type { Meeting, MeetingDraft } from './types';

export interface GoogleCalendarReconcile {
  readonly upserts: MeetingDraft[];
  readonly removeIds: readonly string[];
}

export function reconcileGoogleCalendar(
  meetings: readonly Meeting[],
  events: readonly GoogleCalendarEvent[],
  options: {
    readonly fullWindow: boolean;
    readonly fallbackRoomId: () => string;
  },
): GoogleCalendarReconcile {
  const upserts: MeetingDraft[] = [];
  const removeIds: string[] = [];
  const queued = new Set<string>();
  const activeIds = new Set<string>();
  const queue = (id: string) => {
    if (queued.has(id)) {
      return;
    }
    queued.add(id);
    removeIds.push(id);
  };

  for (const event of events) {
    if (!event.id) {
      continue;
    }
    if (event.status === 'cancelled') {
      const linked = meetings.find((meeting) => meeting.googleEventId === event.id);
      if (linked) {
        queue(linked.id);
      }
      continue;
    }
    activeIds.add(event.id);
    const draft = meetingFromGoogleEvent(event, options.fallbackRoomId());
    if (draft) {
      upserts.push(draft);
    }
  }

  if (options.fullWindow) {
    for (const meeting of meetings) {
      if (!meeting.googleEventId || activeIds.has(meeting.googleEventId)) {
        continue;
      }
      queue(meeting.id);
    }
  }

  return { upserts, removeIds };
}
