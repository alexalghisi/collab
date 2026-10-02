import { describe, expect, it } from 'vitest';
import { buildIcs, googleCalendarUrl } from './calendarExport';
import type { Meeting } from './types';

const meeting: Meeting = {
  id: 'm1',
  title: 'Weekly sync',
  roomId: 'room-1',
  startsAt: Date.parse('2026-10-02T15:00:00.000Z'),
  durationMinutes: 30,
  description: 'Agenda',
  createdAt: Date.parse('2026-10-01T12:00:00.000Z'),
  invitees: [{ uid: 'u1', displayName: 'Ada Lovelace', email: 'ada@example.com' }],
  guests: ['linus@example.com'],
};

const inviteLink = 'https://example.com/?room=room-1';

describe('calendar export', () => {
  it('puts named people and extra guests on the Google Calendar template', () => {
    const url = googleCalendarUrl(meeting, inviteLink);
    expect(url).toContain('add=ada%40example.com%2Clinus%40example.com');
  });

  it('writes ATTENDEE lines into the downloaded .ics', () => {
    const ics = buildIcs(meeting, inviteLink);
    expect(ics).toContain('ATTENDEE:mailto:ada@example.com');
    expect(ics).toContain('ATTENDEE:mailto:linus@example.com');
  });
});
