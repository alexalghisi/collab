import { describe, expect, it } from 'vitest';
import { buildIcs, googleCalendarUrl } from './calendarExport';
import { describeInvitees, type Meeting } from './types';

const meeting: Meeting = {
  id: 'm1',
  title: 'Weekly sync',
  roomId: 'blue-otter-42',
  startsAt: Date.UTC(2026, 8, 14, 9, 0),
  durationMinutes: 30,
  description: 'Agenda in the doc.',
  invitees: [
    { id: 'a1', name: 'Ada Lovelace', email: 'ada@example.com' },
    { id: 'a2', name: 'Linus', email: 'linus@example.com' },
  ],
  createdAt: Date.UTC(2026, 8, 13, 8, 0),
};

const link = 'https://collab.example/?room=blue-otter-42';

describe('buildIcs', () => {
  it('lists every invitee as an attendee', () => {
    const ics = buildIcs(meeting, link);

    expect(ics).toContain('ATTENDEE;CN=Ada Lovelace;RSVP=TRUE:mailto:ada@example.com');
    expect(ics).toContain('ATTENDEE;CN=Linus;RSVP=TRUE:mailto:linus@example.com');
    expect(ics).toContain('DTSTART:20260914T090000Z');
    expect(ics).toContain('DTEND:20260914T093000Z');
  });

  it('leaves the attendee lines out when nobody was invited', () => {
    expect(buildIcs({ ...meeting, invitees: [] }, link)).not.toContain('ATTENDEE');
  });
});

describe('googleCalendarUrl', () => {
  it('passes the invitees as guests', () => {
    const url = new URL(googleCalendarUrl(meeting, link));

    expect(url.searchParams.getAll('add')).toEqual(['ada@example.com', 'linus@example.com']);
    expect(url.searchParams.get('text')).toBe('Weekly sync');
  });
});

describe('describeInvitees', () => {
  it('reads as a sentence, however many people there are', () => {
    expect(describeInvitees([])).toBe('Just you');
    expect(describeInvitees(meeting.invitees.slice(0, 1))).toBe('Ada Lovelace');
    expect(describeInvitees(meeting.invitees)).toBe('Ada Lovelace and Linus');
    expect(
      describeInvitees([
        ...meeting.invitees,
        { id: 'a3', name: 'Grace', email: 'grace@example.com' },
      ]),
    ).toBe('Ada Lovelace, Linus and Grace');
  });
});
