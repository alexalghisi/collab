import { randomUUID } from 'node:crypto';
import type { Account } from '../../../src/auth/types';
import {
  isInvited,
  normalizeMeetingDraft,
  type Meeting,
  type MeetingAttendee,
} from '../../../src/meeting/types';
import { JsonFile } from '../db/JsonFile';

export interface MeetingsFile {
  meetings: Meeting[];
}

const EMPTY: MeetingsFile = { meetings: [] };

/** Just enough of the account store for resolving a guest list to names. */
export interface AccountDirectory {
  get(id: string): Account | null;
}

export type ScheduleResult =
  | { readonly ok: true; readonly meeting: Meeting }
  | { readonly ok: false; readonly reason: 'invalid' };

const attendeeOf = ({ id, displayName, email }: Account): MeetingAttendee => ({
  id,
  displayName,
  email,
});

const byStart = (a: Meeting, b: Meeting) => a.startsAt - b.startsAt;

/**
 * Scheduled meetings, in the same local database as the accounts. Keeping them
 * next to the directory is what makes a shared calendar possible: the meeting
 * is one record listing the organiser and the guests, so it shows up for
 * everybody invited instead of only for whoever typed it in.
 */
export class MeetingStore {
  private readonly data: MeetingsFile;

  constructor(
    private readonly accounts: AccountDirectory,
    private readonly file: JsonFile<MeetingsFile> = new JsonFile(null, EMPTY),
    private readonly now: () => number = Date.now,
  ) {
    this.data = { meetings: this.file.read().meetings ?? [] };
  }

  /** Everything `accountId` organises or was invited to, earliest first. */
  forAccount(accountId: string): Meeting[] {
    return this.data.meetings
      .filter((meeting) => isInvited(meeting, accountId))
      .sort(byStart)
      .map((meeting) => ({ ...meeting }));
  }

  schedule(organizer: Account, input: unknown): ScheduleResult {
    const draft = normalizeMeetingDraft(input);
    if (!draft) {
      return { ok: false, reason: 'invalid' };
    }
    // An id nobody has an account for is dropped rather than refused: the
    // meeting is still worth keeping, and the guest list stays truthful.
    const attendees = draft.attendeeIds
      .filter((id) => id !== organizer.id)
      .map((id) => this.accounts.get(id))
      .filter((account): account is Account => account !== null)
      .map(attendeeOf);

    const meeting: Meeting = {
      id: randomUUID(),
      title: draft.title,
      roomId: draft.roomId,
      startsAt: draft.startsAt,
      durationMinutes: draft.durationMinutes,
      description: draft.description,
      createdAt: this.now(),
      organizer: attendeeOf(organizer),
      attendees,
    };
    this.data.meetings.push(meeting);
    this.file.write(this.data);
    return { ok: true, meeting };
  }

  /** Only the organiser cancels; for everybody else it is not theirs to drop. */
  cancel(accountId: string, meetingId: string): 'cancelled' | 'not-organizer' | 'unknown' {
    const meeting = this.data.meetings.find((entry) => entry.id === meetingId);
    if (!meeting) {
      return 'unknown';
    }
    if (meeting.organizer.id !== accountId) {
      return 'not-organizer';
    }
    this.data.meetings = this.data.meetings.filter((entry) => entry.id !== meetingId);
    this.file.write(this.data);
    return 'cancelled';
  }
}

/** `null` for the path keeps the meetings in memory for the lifetime of the process. */
export function createMeetingStore(accounts: AccountDirectory, path: string | null): MeetingStore {
  return new MeetingStore(accounts, new JsonFile<MeetingsFile>(path, { meetings: [] }));
}
