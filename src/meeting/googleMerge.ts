import type { Meeting, MeetingDraft } from './types';

export interface GoogleMergePlan {
  readonly updates: Meeting[];
  readonly additions: MeetingDraft[];
  readonly removals: string[];
}

export function planGoogleMerge(
  current: readonly Meeting[],
  drafts: readonly MeetingDraft[],
  cancelledEventIds: readonly string[],
): GoogleMergePlan {
  const cancelled = new Set(cancelledEventIds);
  const byEventId = new Map(
    current
      .filter((meeting) => meeting.googleEventId !== undefined)
      .map((meeting) => [meeting.googleEventId as string, meeting]),
  );

  const updates: Meeting[] = [];
  const additions: MeetingDraft[] = [];

  for (const draft of drafts) {
    if (draft.googleEventId === undefined || cancelled.has(draft.googleEventId)) {
      continue;
    }
    const existing = byEventId.get(draft.googleEventId);
    if (!existing) {
      additions.push(draft);
      continue;
    }
    updates.push({
      ...existing,
      title: draft.title,
      startsAt: draft.startsAt,
      durationMinutes: draft.durationMinutes,
      description: draft.description,
    });
  }

  const removals = [...cancelled]
    .map((eventId) => byEventId.get(eventId))
    .filter((meeting): meeting is Meeting => meeting !== undefined)
    .map((meeting) => meeting.id);

  return { updates, additions, removals };
}
