import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { firestore } from '../firebase/app';
import { createMeetingStore } from './store';
import { planGoogleMerge } from './googleMerge';
import type { Meeting, MeetingDraft } from './types';

export interface MeetingsState {
  readonly meetings: Meeting[];
  schedule: (draft: MeetingDraft) => Promise<Meeting>;
  save: (meeting: Meeting) => Promise<void>;
  remove: (id: string) => Promise<void>;
  applyGoogle: (drafts: MeetingDraft[], cancelledEventIds: string[]) => Promise<void>;
  /** Adds an instant meeting to the history unless the room is already scheduled. */
  recordInstant: (roomId: string) => Promise<void>;
}

export function useMeetings(uid: string): MeetingsState {
  const store = useMemo(() => createMeetingStore(firestore, uid), [uid]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const meetingsRef = useRef(meetings);
  meetingsRef.current = meetings;

  useEffect(() => store.subscribe(setMeetings), [store]);

  const save = useCallback((meeting: Meeting) => store.save(meeting), [store]);

  const schedule = useCallback(
    async (draft: MeetingDraft) => {
      const meeting: Meeting = { ...draft, id: randomUUID(), createdAt: Date.now() };
      await store.save(meeting);
      return meeting;
    },
    [store],
  );

  const remove = useCallback((id: string) => store.remove(id), [store]);

  const applyGoogle = useCallback(
    async (drafts: MeetingDraft[], cancelledEventIds: string[]) => {
      const plan = planGoogleMerge(meetingsRef.current, drafts, cancelledEventIds);
      for (const meeting of plan.updates) {
        await store.save(meeting);
      }
      for (const draft of plan.additions) {
        await store.save({ ...draft, id: randomUUID(), createdAt: Date.now() });
      }
      for (const id of plan.removals) {
        await store.remove(id);
      }
    },
    [store],
  );

  const recordInstant = useCallback(
    async (roomId: string) => {
      if (meetingsRef.current.some((meeting) => meeting.roomId === roomId)) {
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
        createdAt: now,
      });
    },
    [store],
  );

  return { meetings, schedule, save, remove, applyGoogle, recordInstant };
}
