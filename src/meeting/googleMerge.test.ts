import { describe, expect, it } from 'vitest';
import { planGoogleMerge } from './googleMerge';
import type { Meeting, MeetingDraft } from './types';

const meeting = (overrides: Partial<Meeting>): Meeting => ({
  id: 'local-1',
  title: 'Standup',
  roomId: 'kqz-wrtm-pfa',
  startsAt: Date.parse('2026-09-16T09:00:00.000Z'),
  durationMinutes: 30,
  description: '',
  createdAt: Date.parse('2026-09-01T00:00:00.000Z'),
  googleEventId: 'evt-1',
  fromGoogle: true,
  ...overrides,
});

const draft = (overrides: Partial<MeetingDraft>): MeetingDraft => ({
  title: 'Standup',
  roomId: 'kqz-wrtm-pfa',
  startsAt: Date.parse('2026-09-16T09:00:00.000Z'),
  durationMinutes: 30,
  description: '',
  googleEventId: 'evt-1',
  fromGoogle: true,
  ...overrides,
});

describe('planGoogleMerge', () => {
  it('carries an edit made in Google onto the meeting already stored here', () => {
    const plan = planGoogleMerge(
      [meeting({})],
      [draft({ title: 'Standup (moved)', startsAt: Date.parse('2026-09-16T10:00:00.000Z') })],
      [],
    );

    expect(plan.additions).toEqual([]);
    expect(plan.removals).toEqual([]);
    expect(plan.updates).toEqual([
      meeting({ title: 'Standup (moved)', startsAt: Date.parse('2026-09-16T10:00:00.000Z') }),
    ]);
  });

  it('keeps the local id, room and creation time when Google sends an edit', () => {
    const [updated] = planGoogleMerge(
      [meeting({ id: 'local-9', roomId: 'own-room', createdAt: 17 })],
      [draft({ roomId: 'google-room' })],
      [],
    ).updates;

    expect(updated.id).toBe('local-9');
    expect(updated.roomId).toBe('own-room');
    expect(updated.createdAt).toBe(17);
  });

  it('adds an event that has no counterpart here yet', () => {
    const plan = planGoogleMerge([], [draft({ googleEventId: 'evt-2' })], []);

    expect(plan.updates).toEqual([]);
    expect(plan.additions).toEqual([draft({ googleEventId: 'evt-2' })]);
  });

  it('drops the meeting once the event is cancelled in Google', () => {
    const plan = planGoogleMerge([meeting({ id: 'local-3' })], [], ['evt-1']);

    expect(plan.removals).toEqual(['local-3']);
    expect(plan.updates).toEqual([]);
    expect(plan.additions).toEqual([]);
  });

  it('leaves meetings that were never Google events alone', () => {
    const own = meeting({ id: 'mine', googleEventId: undefined, fromGoogle: undefined });

    expect(planGoogleMerge([own], [], ['evt-1'])).toEqual({
      updates: [],
      additions: [],
      removals: [],
    });
  });

  it('ignores a cancellation for an event it never stored', () => {
    expect(planGoogleMerge([meeting({})], [], ['evt-unknown']).removals).toEqual([]);
  });

  it('prefers the cancellation when Google sends both in one batch', () => {
    const plan = planGoogleMerge([meeting({ id: 'local-4' })], [draft({})], ['evt-1']);

    expect(plan.removals).toEqual(['local-4']);
    expect(plan.updates).toEqual([]);
  });
});
