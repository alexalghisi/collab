/** Someone with a Collab account, picked by name when scheduling. */
export interface MeetingInvitee {
  readonly uid: string;
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
  /** Account that scheduled this meeting. Absent on older saves and on imported events. */
  readonly createdBy?: string;
  readonly googleEventId?: string;
  readonly fromGoogle?: boolean;
  readonly guests?: readonly string[];
  readonly invitees?: readonly MeetingInvitee[];
  readonly reminderMinutes?: 15 | 30;
}

export type MeetingDraft = Omit<Meeting, 'id' | 'createdAt' | 'createdBy'>;

/**
 * The account that scheduled a meeting can change it.
 * Older saves have no creator and live in that account's own list, so they stay editable.
 * Events imported from Google were not created here.
 */
export function canEditMeeting(
  meeting: Pick<Meeting, 'createdBy' | 'fromGoogle'>,
  uid: string,
): boolean {
  if (meeting.createdBy) {
    return meeting.createdBy === uid;
  }
  return meeting.fromGoogle !== true;
}

export function meetingEndsAt(meeting: Meeting): number {
  return meeting.startsAt + meeting.durationMinutes * 60_000;
}

function uniqueContacts(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const contacts: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    contacts.push(trimmed);
  }
  return contacts;
}

/** Emails and phone numbers used to send invites (named people plus extra guests). */
export function meetingInviteContacts(meeting: Pick<Meeting, 'guests' | 'invitees'>): string[] {
  return uniqueContacts([
    ...(meeting.invitees ?? []).map((person) => person.email),
    ...(meeting.guests ?? []),
  ]);
}

/** Names for the calendar and meeting lists; extra guests keep their email or number. */
export function meetingAttendeeNames(meeting: Pick<Meeting, 'guests' | 'invitees'>): string[] {
  const named = (meeting.invitees ?? [])
    .map((person) => person.displayName.trim())
    .filter((name) => name.length > 0);
  const namedEmails = new Set(
    (meeting.invitees ?? []).map((person) => person.email.trim().toLowerCase()),
  );
  const extras = (meeting.guests ?? []).filter(
    (guest) => !namedEmails.has(guest.trim().toLowerCase()),
  );
  return [...named, ...extras];
}
