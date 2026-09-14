import { describe, expect, it } from 'vitest';
import { describePeople, formatNameList } from './people';
import type { Meeting, MeetingAttendee } from './types';

const person = (id: string, displayName: string): MeetingAttendee => ({
  id,
  displayName,
  email: `${id}@example.com`,
});

const meeting = (organizer: MeetingAttendee, attendees: MeetingAttendee[]): Meeting => ({
  id: 'm1',
  title: 'Weekly sync',
  roomId: 'quiet-otter-42',
  startsAt: 1_900_000_000_000,
  durationMinutes: 30,
  description: '',
  createdAt: 1,
  organizer,
  attendees,
});

const ada = person('ada', 'Ada Lovelace');
const linus = person('linus', 'Linus');
const grace = person('grace', 'Grace Hopper');

describe('formatNameList', () => {
  it('reads the way a person would say it', () => {
    expect(formatNameList([])).toBe('');
    expect(formatNameList(['Ada'])).toBe('Ada');
    expect(formatNameList(['Ada', 'Linus'])).toBe('Ada and Linus');
    expect(formatNameList(['Ada', 'Linus', 'Grace'])).toBe('Ada, Linus and Grace');
  });
});

describe('describePeople', () => {
  it('names the guests of a meeting you scheduled', () => {
    expect(describePeople(meeting(ada, [linus, grace]), 'ada')).toBe('With Linus and Grace Hopper');
  });

  it('says so when a meeting is only yours', () => {
    expect(describePeople(meeting(ada, []), 'ada')).toBe('Just you');
  });

  it('credits whoever invited you', () => {
    expect(describePeople(meeting(ada, [linus, grace]), 'linus')).toBe(
      'Ada Lovelace invited you and Grace Hopper',
    );
    expect(describePeople(meeting(ada, [linus]), 'linus')).toBe('Ada Lovelace invited you');
  });
});
