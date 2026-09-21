import type { Meeting } from './types';

export async function deleteMeeting(
  meeting: Meeting,
  retract: (meeting: Meeting) => Promise<void>,
  remove: (id: string) => Promise<void>,
): Promise<void> {
  await retract(meeting);
  await remove(meeting.id);
}
