import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { firestore } from '../firebase/app';
import { createMeetingStore } from './store';
import type { Meeting, MeetingDraft } from './types';

export interface MeetingsState {
  readonly meetings: Meeting[];
  schedule: (draft: MeetingDraft) => Promise<Meeting>;
  save: (meeting: Meeting) => Promise<void>;
  remove: (id: string) => Promise<void>;
  applyGoogle: (drafts: MeetingDraft[]) => Promise<void>;
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
    async (drafts: MeetingDraft[]) => {
      let current = meetingsRef.current;
      for (const draft of drafts) {
        const existing = current.find((meeting) => meeting.googleEventId === draft.googleEventId);
        if (existing) {
          const next = {
            ...existing,
            title: draft.title,
            startsAt: draft.startsAt,
            durationMinutes: draft.durationMinutes,
            description: draft.description,
          };
          await store.save(next);
          current = current.map((meeting) => (meeting.id === existing.id ? next : meeting));
        } else {
          const created: Meeting = { ...draft, id: randomUUID(), createdAt: Date.now() };
          await store.save(created);
          current = [...current, created];
        }
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
