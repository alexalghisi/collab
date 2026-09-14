import { meetingPeople, type Meeting } from './types';

/** "Ada", "Ada and Linus", "Ada, Linus and Grace". */
export function formatNameList(names: string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Who a meeting is with, read from the point of view of whoever is looking:
 * "Just you", "With Ada and Linus", "Ada invited you and Grace".
 */
export function describePeople(meeting: Meeting, selfId: string): string {
  const others = meetingPeople(meeting).filter((person) => person.id !== selfId);
  const names = others.map((person) => person.displayName);
  if (meeting.organizer.id === selfId) {
    return names.length === 0 ? 'Just you' : `With ${formatNameList(names)}`;
  }
  const guests = others
    .filter((person) => person.id !== meeting.organizer.id)
    .map((person) => person.displayName);
  return `${meeting.organizer.displayName} invited ${formatNameList(['you', ...guests])}`;
}
