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
}

export type MeetingDraft = Omit<Meeting, 'id' | 'createdAt'>;

export function meetingEndsAt(meeting: Meeting): number {
  return meeting.startsAt + meeting.durationMinutes * 60_000;
}
