import { describe, expect, it } from 'vitest';
import {
  calendarWindow,
  eventDurationMinutes,
  eventStartsAt,
  meetingFromGoogleEvent,
  roomIdFromEvent,
  type GoogleCalendarEvent,
} from './googleCalendar';

const timed: GoogleCalendarEvent = {
  id: 'evt-1',
  summary: 'Standup',
  description: 'Daily',
  location: 'https://alexalghisi.github.io/collab/?room=kqz-wrtm-pfa',
  start: { dateTime: '2026-09-16T09:00:00.000Z' },
  end: { dateTime: '2026-09-16T09:30:00.000Z' },
};

describe('google calendar mapping', () => {
  it('turns a timed Google event into a Collab meeting and keeps the invite room', () => {
    expect(meetingFromGoogleEvent(timed, 'fallback-room')).toEqual({
      title: 'Standup',
      roomId: 'kqz-wrtm-pfa',
      startsAt: Date.parse('2026-09-16T09:00:00.000Z'),
      durationMinutes: 30,
      description: 'Daily',
      googleEventId: 'evt-1',
      fromGoogle: true,
    });
  });

  it('skips cancelled events and events without a start', () => {
    expect(meetingFromGoogleEvent({ ...timed, status: 'cancelled' }, 'room')).toBeNull();
    expect(meetingFromGoogleEvent({ id: 'x', summary: 'Nope' }, 'room')).toBeNull();
  });

  it('uses a fallback room and Busy when Google left those fields empty', () => {
    const draft = meetingFromGoogleEvent(
      {
        id: 'evt-2',
        start: { dateTime: '2026-09-16T10:00:00.000Z' },
        end: { dateTime: '2026-09-16T11:00:00.000Z' },
      },
      'new-room',
    );
    expect(draft?.title).toBe('Busy');
    expect(draft?.roomId).toBe('new-room');
  });

  it('reads all-day bounds and a room id buried in the description', () => {
    const event: GoogleCalendarEvent = {
      id: 'all-day',
      start: { date: '2026-09-16' },
      end: { date: '2026-09-17' },
      description: 'Join: https://example.com/?room=abc-defg-hij',
    };
    expect(eventStartsAt(event)).toBe(Date.parse('2026-09-16'));
    expect(eventDurationMinutes(event, Date.parse('2026-09-16'))).toBe(24 * 60);
    expect(roomIdFromEvent(event)).toBe('abc-defg-hij');
  });

  it('asks Google for the last month through the next year', () => {
    const window = calendarWindow(Date.parse('2026-09-16T12:00:00.000Z'));
    expect(window.timeMin).toBe('2026-08-17T12:00:00.000Z');
    expect(window.timeMax).toBe('2027-09-16T12:00:00.000Z');
  });
});
