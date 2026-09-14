/** Somebody invited to a meeting, taken from the deployment's account directory. */
export interface MeetingInvitee {
  readonly id: string;
  readonly name: string;
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
  /** Who is expected, besides whoever scheduled it. */
  readonly invitees: MeetingInvitee[];
  readonly createdAt: number;
}

export type MeetingDraft = Omit<Meeting, 'id' | 'createdAt'>;

export function meetingEndsAt(meeting: Meeting): number {
  return meeting.startsAt + meeting.durationMinutes * 60_000;
}

/** "Ada Lovelace and Linus", the way a row or a calendar cell says who is coming. */
export function describeInvitees(invitees: MeetingInvitee[]): string {
  const names = invitees.map((invitee) => invitee.name);
  if (names.length === 0) {
    return 'Just you';
  }
  if (names.length === 1) {
    return names[0];
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
