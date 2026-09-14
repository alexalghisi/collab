import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { storage } from '../storage/keyValue';
import type { Meeting } from './types';

export type MeetingsListener = (meetings: Meeting[]) => void;

export interface MeetingStore {
  subscribe(listener: MeetingsListener): () => void;
  save(meeting: Meeting): Promise<void>;
  remove(id: string): Promise<void>;
}

const byStart = (a: Meeting, b: Meeting) => a.startsAt - b.startsAt;

/** A meeting stored before it could have invitees still has to load. */
const restore = (stored: Meeting): Meeting => ({ ...stored, invitees: stored.invitees ?? [] });

function createFirestoreStore(db: Firestore, uid: string): MeetingStore {
  const meetings = collection(db, 'users', uid, 'meetings');
  return {
    subscribe(listener) {
      return onSnapshot(query(meetings, orderBy('startsAt')), (snapshot) => {
        listener(snapshot.docs.map((entry) => restore(entry.data() as Meeting)));
      });
    },
    save(meeting) {
      return setDoc(doc(meetings, meeting.id), meeting);
    },
    remove(id) {
      return deleteDoc(doc(meetings, id));
    },
  };
}

function createLocalStore(uid: string): MeetingStore {
  const key = `collab.meetings.${uid}`;
  const listeners = new Set<MeetingsListener>();
  let meetings: Meeting[] = (JSON.parse(storage.read(key) ?? '[]') as Meeting[]).map(restore);

  const commit = (next: Meeting[]) => {
    meetings = next.sort(byStart);
    storage.write(key, JSON.stringify(meetings));
    listeners.forEach((listener) => listener(meetings));
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(meetings);
      return () => listeners.delete(listener);
    },
    async save(meeting) {
      commit([...meetings.filter((entry) => entry.id !== meeting.id), meeting]);
    },
    async remove(id) {
      commit(meetings.filter((entry) => entry.id !== id));
    },
  };
}

export function createMeetingStore(db: Firestore | null, uid: string): MeetingStore {
  return db ? createFirestoreStore(db, uid) : createLocalStore(uid);
}
