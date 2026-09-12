import { meetingEndsAt, type Meeting } from './types';

/** `20260913T141500Z` — the compact UTC form shared by Google Calendar links and iCalendar. */
function toUtcStamp(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export function googleCalendarUrl(meeting: Meeting, inviteLink: string): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: meeting.title,
    dates: `${toUtcStamp(meeting.startsAt)}/${toUtcStamp(meetingEndsAt(meeting))}`,
    details: [meeting.description, `Join: ${inviteLink}`].filter(Boolean).join('\n\n'),
    location: inviteLink,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const escapeIcsText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function buildIcs(meeting: Meeting, inviteLink: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Collab//Meetings//EN',
    'BEGIN:VEVENT',
    `UID:${meeting.id}@collab`,
    `DTSTAMP:${toUtcStamp(meeting.createdAt)}`,
    `DTSTART:${toUtcStamp(meeting.startsAt)}`,
    `DTEND:${toUtcStamp(meetingEndsAt(meeting))}`,
    `SUMMARY:${escapeIcsText(meeting.title)}`,
    `DESCRIPTION:${escapeIcsText([meeting.description, `Join: ${inviteLink}`].filter(Boolean).join('\n'))}`,
    `LOCATION:${escapeIcsText(inviteLink)}`,
    `URL:${inviteLink}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
