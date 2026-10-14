import { describe, expect, it } from 'vitest';
import {
  canEditMeeting,
  canRescheduleMeeting,
  meetingAttendeeNames,
  meetingInviteContacts,
  type Meeting,
} from './types';

const meeting: Meeting = {
  id: 'm1',
  title: 'Weekly sync',
  roomId: 'room-1',
  startsAt: 0,
  durationMinutes: 30,
  description: '',
  createdAt: 0,
  invitees: [{ uid: 'u1', displayName: 'Ada Lovelace', email: 'ada@example.com' }],
  guests: ['ada@example.com', 'linus@example.com', '+15551234567'],
};

describe('canEditMeeting', () => {
  it('lets the creator edit', () => {
    expect(canEditMeeting({ ...meeting, createdBy: 'host' }, 'host')).toBe(true);
  });

  it('refuses someone else', () => {
    expect(canEditMeeting({ ...meeting, createdBy: 'host' }, 'guest')).toBe(false);
  });

  it('keeps older meetings in this account editable', () => {
    expect(canEditMeeting(meeting, 'host')).toBe(true);
  });

  it('leaves imported Google events alone', () => {
    expect(canEditMeeting({ ...meeting, fromGoogle: true }, 'host')).toBe(false);
  });
});

describe('canRescheduleMeeting', () => {
  it('lets the creator move a scheduled meeting', () => {
    expect(canRescheduleMeeting({ ...meeting, createdBy: 'host' }, 'host')).toBe(true);
  });

  it('lets an imported Google event move', () => {
    expect(canRescheduleMeeting({ ...meeting, fromGoogle: true }, 'host')).toBe(true);
  });

  it('leaves an instant meeting where it is', () => {
    expect(
      canRescheduleMeeting({ ...meeting, createdBy: 'host', durationMinutes: 0 }, 'host'),
    ).toBe(false);
  });

  it('refuses someone else', () => {
    expect(canRescheduleMeeting({ ...meeting, createdBy: 'host' }, 'guest')).toBe(false);
  });
});

describe('meeting attendees', () => {
  it('lists names first and keeps extra emails or numbers', () => {
    expect(meetingAttendeeNames(meeting)).toEqual([
      'Ada Lovelace',
      'linus@example.com',
      '+15551234567',
    ]);
  });

  it('sends invites to named people and extra guests without duplicates', () => {
    expect(meetingInviteContacts(meeting)).toEqual([
      'ada@example.com',
      'linus@example.com',
      '+15551234567',
    ]);
  });
});
