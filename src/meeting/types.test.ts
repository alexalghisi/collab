import { describe, expect, it } from 'vitest';
import { meetingAttendeeNames, meetingInviteContacts, type Meeting } from './types';

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
