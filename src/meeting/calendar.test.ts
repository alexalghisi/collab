import { describe, expect, it } from 'vitest';
import { meetingWithStartTime } from './calendar';
import type { Meeting } from './types';

const start = new Date(2026, 9, 10, 11, 0, 0, 0);

const meeting: Meeting = {
  id: 'm1',
  title: 'Weekly sync',
  roomId: 'room-1',
  startsAt: start.getTime(),
  durationMinutes: 60,
  description: '',
  createdAt: 0,
};

describe('meetingWithStartTime', () => {
  it('moves a scheduled meeting to a new time on the same day', () => {
    const next = meetingWithStartTime(meeting, '15:30');
    expect(next).not.toBeNull();
    const when = new Date(next!.startsAt);
    expect(when.getFullYear()).toBe(2026);
    expect(when.getMonth()).toBe(9);
    expect(when.getDate()).toBe(10);
    expect(when.getHours()).toBe(15);
    expect(when.getMinutes()).toBe(30);
    expect(next!.id).toBe(meeting.id);
    expect(next!.durationMinutes).toBe(60);
  });

  it('rejects a time that is not a clock value', () => {
    expect(meetingWithStartTime(meeting, 'noon')).toBeNull();
  });

  it('leaves the meeting alone when the time did not change', () => {
    expect(meetingWithStartTime(meeting, '11:00')).toBeNull();
  });
});
