import { describe, expect, it } from 'vitest';
import { buildIcs, googleCalendarUrl } from './calendarExport';
import type { Meeting } from './types';

const meeting: Meeting = {
  id: 'm1',
  title: 'Weekly sync; with a semicolon',
  roomId: 'quiet-otter-42',
  startsAt: Date.UTC(2026, 8, 14, 9, 30),
  durationMinutes: 30,
  description: 'Agenda, and a comma',
  createdAt: Date.UTC(2026, 8, 13, 8, 0),
  organizer: { id: 'ada', displayName: 'Ada Lovelace', email: 'ada@example.com' },
  attendees: [{ id: 'linus', displayName: 'Linus', email: 'linus@example.com' }],
};

const link = 'https://collab.example/?room=quiet-otter-42';

describe('buildIcs', () => {
  it('writes the window, the people and escapes the text', () => {
    const lines = buildIcs(meeting, link).split('\r\n');

    expect(lines).toContain('DTSTART:20260914T093000Z');
    expect(lines).toContain('DTEND:20260914T100000Z');
    expect(lines).toContain('SUMMARY:Weekly sync\\; with a semicolon');
    expect(lines).toContain('ORGANIZER;CN=Ada Lovelace:mailto:ada@example.com');
    expect(lines).toContain('ATTENDEE;CN=Linus;RSVP=TRUE:mailto:linus@example.com');
    expect(lines.at(-1)).toBe('');
  });

  it('lists nobody but the organiser for a meeting with no guests', () => {
    const alone = buildIcs({ ...meeting, attendees: [] }, link);

    expect(alone).toContain('ORGANIZER;CN=Ada Lovelace');
    expect(alone).not.toContain('ATTENDEE');
  });
});

describe('googleCalendarUrl', () => {
  it('carries the window, the join link and the guests', () => {
    const url = new URL(googleCalendarUrl(meeting, link));

    expect(url.searchParams.get('dates')).toBe('20260914T093000Z/20260914T100000Z');
    expect(url.searchParams.get('location')).toBe(link);
    expect(url.searchParams.getAll('add')).toEqual(['linus@example.com']);
  });
});
