import { describe, expect, it } from 'vitest';
import { mergeGoogleDraft } from './reconcileGoogleCalendar';
import type { Meeting, MeetingDraft } from './types';

const existing: Meeting = {
  id: 'm1',
  title: 'Weekly sync',
  roomId: 'room-1',
  startsAt: Date.parse('2026-10-10T11:00:00.000Z'),
  durationMinutes: 60,
  description: 'Bring notes',
  createdAt: 1,
  createdBy: 'host',
  googleEventId: 'evt-1',
};

const draft: MeetingDraft = {
  title: 'Weekly sync (Google)',
  roomId: 'other-room',
  startsAt: Date.parse('2026-10-10T09:00:00.000Z'),
  durationMinutes: 30,
  description: 'Moved in Google',
  googleEventId: 'evt-1',
  fromGoogle: true,
};

describe('mergeGoogleDraft', () => {
  it('keeps the time chosen in Collab for a meeting scheduled here', () => {
    const next = mergeGoogleDraft(existing, draft);
    expect(next.startsAt).toBe(existing.startsAt);
    expect(next.durationMinutes).toBe(existing.durationMinutes);
    expect(next.roomId).toBe(existing.roomId);
    expect(next.title).toBe(draft.title);
    expect(next.description).toBe(draft.description);
  });

  it('takes the Google time for an event imported from Google', () => {
    const next = mergeGoogleDraft({ ...existing, fromGoogle: true }, draft);
    expect(next.startsAt).toBe(draft.startsAt);
    expect(next.durationMinutes).toBe(draft.durationMinutes);
  });
});
