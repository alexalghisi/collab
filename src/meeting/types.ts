/** Someone expected at a meeting, as taken from the account directory. */
export interface MeetingAttendee {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
}

export interface Meeting {
  readonly id: string;
  readonly title: string;
  readonly roomId: string;
  /** Start time in epoch milliseconds. */
  readonly startsAt: number;
  /** Zero for instant meetings recorded in the history. */
  readonly durationMinutes: number;
  readonly description: string;
  readonly createdAt: number;
  /** Whoever scheduled it; they are the only one who can cancel it. */
  readonly organizer: MeetingAttendee;
  /** Everyone else invited, so the calendar can say who you have and when. */
  readonly attendees: readonly MeetingAttendee[];
}

/** What the client asks for; names come from the directory, not from the client. */
export interface MeetingDraft {
  readonly title: string;
  readonly roomId: string;
  readonly startsAt: number;
  readonly durationMinutes: number;
  readonly description: string;
  readonly attendeeIds: readonly string[];
}

export const MAX_TITLE_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_DURATION_MINUTES = 24 * 60;
/** Enough for a whole team; past that it is a broadcast, not a meeting. */
export const MAX_ATTENDEES = 64;

export function meetingEndsAt(meeting: Meeting): number {
  return meeting.startsAt + meeting.durationMinutes * 60_000;
}

/** The organiser first, then the guests, which is the order people read. */
export function meetingPeople(meeting: Meeting): MeetingAttendee[] {
  return [meeting.organizer, ...meeting.attendees];
}

/** Whether `accountId` is the organiser or one of the guests. */
export function isInvited(meeting: Meeting, accountId: string): boolean {
  return meetingPeople(meeting).some((person) => person.id === accountId);
}

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * Reads a scheduling request off the wire. The server stores nothing it has not
 * checked here first: a title it can show, a start it can sort by, a duration
 * that ends the same day, and a guest list of plausible account ids.
 */
export function normalizeMeetingDraft(input: unknown): MeetingDraft | null {
  const draft = (input ?? {}) as Partial<MeetingDraft>;
  const title = text(draft.title, MAX_TITLE_LENGTH);
  const roomId = text(draft.roomId, 64);
  const startsAt = Number(draft.startsAt);
  const durationMinutes = Number(draft.durationMinutes ?? 0);
  if (title === '' || roomId === '' || !Number.isFinite(startsAt) || startsAt <= 0) {
    return null;
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
    return null;
  }
  const attendeeIds = Array.isArray(draft.attendeeIds)
    ? [...new Set(draft.attendeeIds.filter((id): id is string => typeof id === 'string'))].slice(
        0,
        MAX_ATTENDEES,
      )
    : [];
  return {
    title,
    roomId,
    startsAt,
    durationMinutes: Math.min(Math.round(durationMinutes), MAX_DURATION_MINUTES),
    description: text(draft.description, MAX_DESCRIPTION_LENGTH),
    attendeeIds,
  };
}
