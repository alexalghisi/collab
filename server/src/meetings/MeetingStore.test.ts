import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Account } from '../../../src/auth/types';
import { JsonFile } from '../db/JsonFile';
import { MeetingStore, type MeetingsFile } from './MeetingStore';

const account = (id: string, displayName: string): Account => ({
  id,
  displayName,
  email: `${id}@example.com`,
  createdAt: 1,
});

const ada = account('ada', 'Ada Lovelace');
const linus = account('linus', 'Linus');
const grace = account('grace', 'Grace Hopper');

const directory = {
  get: (id: string) => [ada, linus, grace].find((entry) => entry.id === id) ?? null,
};

const draft = {
  title: '  Weekly sync  ',
  roomId: 'quiet-otter-42',
  startsAt: 1_900_000_000_000,
  durationMinutes: 30,
  description: '  agenda  ',
  attendeeIds: ['linus'],
};

const store = (path: string | null = null) =>
  new MeetingStore(directory, new JsonFile<MeetingsFile>(path, { meetings: [] }), () => 5);

describe('scheduling', () => {
  it('records the organiser, resolves the guests and trims the text', () => {
    const meetings = store();

    const result = meetings.schedule(ada, draft);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meeting).toMatchObject({
      title: 'Weekly sync',
      description: 'agenda',
      createdAt: 5,
      organizer: { id: 'ada', displayName: 'Ada Lovelace', email: 'ada@example.com' },
      attendees: [{ id: 'linus', displayName: 'Linus', email: 'linus@example.com' }],
    });
  });

  it('refuses a meeting with no title, no room or no start', () => {
    const meetings = store();

    expect(meetings.schedule(ada, { ...draft, title: '  ' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(meetings.schedule(ada, { ...draft, roomId: '' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(meetings.schedule(ada, { ...draft, startsAt: 'tomorrow' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('drops an unknown guest and never invites the organiser twice', () => {
    const meetings = store();

    const result = meetings.schedule(ada, {
      ...draft,
      attendeeIds: ['linus', 'linus', 'ada', 'nobody'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meeting.attendees.map((person) => person.id)).toEqual(['linus']);
  });

  it('caps a duration that would run past a day', () => {
    const meetings = store();

    const result = meetings.schedule(ada, { ...draft, durationMinutes: 10_000 });

    expect(result.ok && result.meeting.durationMinutes).toBe(24 * 60);
  });
});

describe('the calendar each account sees', () => {
  it('shows a meeting to the organiser and to the guests, earliest first', () => {
    const meetings = store();
    meetings.schedule(ada, { ...draft, title: 'Later', startsAt: 2_000_000_000_000 });
    meetings.schedule(ada, { ...draft, title: 'Sooner', startsAt: 1_000_000_000_000 });

    expect(meetings.forAccount('ada').map((meeting) => meeting.title)).toEqual(['Sooner', 'Later']);
    expect(meetings.forAccount('linus').map((meeting) => meeting.title)).toEqual([
      'Sooner',
      'Later',
    ]);
    expect(meetings.forAccount('grace')).toEqual([]);
  });
});

describe('cancelling', () => {
  it('lets the organiser cancel and nobody else', () => {
    const meetings = store();
    const created = meetings.schedule(ada, draft);
    if (!created.ok) throw new Error('scheduling failed');
    const { id } = created.meeting;

    expect(meetings.cancel('linus', id)).toBe('not-organizer');
    expect(meetings.forAccount('linus')).toHaveLength(1);
    expect(meetings.cancel('ada', id)).toBe('cancelled');
    expect(meetings.forAccount('linus')).toEqual([]);
    expect(meetings.cancel('ada', id)).toBe('unknown');
  });
});

describe('the database file', () => {
  it('still has the meeting after a restart', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'collab-meetings-')), 'meetings.json');
    store(path).schedule(ada, draft);

    expect(
      store(path)
        .forAccount('linus')
        .map((meeting) => meeting.title),
    ).toEqual(['Weekly sync']);
  });
});
