import { useCallback, useEffect, useMemo, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { firestore } from '../firebase/app';
import { createMeetingStore } from './store';
import type { Meeting, MeetingDraft } from './types';

export interface MeetingsState {
  readonly meetings: Meeting[];
  schedule: (draft: MeetingDraft) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Adds an instant meeting to the history unless the room is already scheduled. */
  recordInstant: (roomId: string) => Promise<void>;
}

export function useMeetings(uid: string): MeetingsState {
  const store = useMemo(() => createMeetingStore(firestore, uid), [uid]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  useEffect(() => store.subscribe(setMeetings), [store]);

  const schedule = useCallback(
    (draft: MeetingDraft) => store.save({ ...draft, id: randomUUID(), createdAt: Date.now() }),
    [store],
  );

  const remove = useCallback((id: string) => store.remove(id), [store]);

  const recordInstant = useCallback(
    async (roomId: string) => {
      if (meetings.some((meeting) => meeting.roomId === roomId)) {
        return;
      }
      const now = Date.now();
      await store.save({
        id: randomUUID(),
        title: 'Instant meeting',
        roomId,
        startsAt: now,
        durationMinutes: 0,
        description: '',
        invitees: [],
        createdAt: now,
      });
    },
    [store, meetings],
  );

  return { meetings, schedule, remove, recordInstant };
}
