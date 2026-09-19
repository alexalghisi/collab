import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import type { AuthUser } from '../auth/types';
import type { ChatMessage } from '../signaling/events';
import { MAX_MESSAGE_CHARS } from './messages';

/** A persistent team conversation, shared by everyone signed in to this deployment. */
export interface Channel {
  readonly id: string;
  readonly name: string;
  readonly createdBy: string;
  readonly createdAt: number;
}

type ChannelDoc = Omit<Channel, 'id'>;
type MessageDoc = Omit<ChatMessage, 'id'>;

export function subscribeChannels(
  db: Firestore,
  listener: (channels: Channel[]) => void,
): Unsubscribe {
  return onSnapshot(query(collection(db, 'channels'), orderBy('createdAt')), (snapshot) => {
    listener(snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as ChannelDoc) })));
  });
}

export function createChannel(db: Firestore, name: string, user: AuthUser): Promise<unknown> {
  const channel: ChannelDoc = { name, createdBy: user.uid, createdAt: Date.now() };
  return addDoc(collection(db, 'channels'), channel);
}

export function subscribeMessages(
  db: Firestore,
  channelId: string,
  listener: (messages: ChatMessage[]) => void,
): Unsubscribe {
  const messages = collection(db, 'channels', channelId, 'messages');
  return onSnapshot(query(messages, orderBy('sentAt')), (snapshot) => {
    listener(snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as MessageDoc) })));
  });
}

export function sendMessage(
  db: Firestore,
  channelId: string,
  user: AuthUser,
  text: string,
): Promise<unknown> {
  const message: MessageDoc = {
    peerId: user.uid,
    displayName: user.displayName,
    text,
    file: null,
    sentAt: Date.now(),
  };
  return addDoc(collection(db, 'channels', channelId, 'messages'), message);
}

export async function editMessage(
  db: Firestore,
  channelId: string,
  user: AuthUser,
  id: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim().slice(0, MAX_MESSAGE_CHARS);
  if (!trimmed) {
    return;
  }
  const ref = doc(db, 'channels', channelId, 'messages', id);
  const snapshot = await getDoc(ref);
  const data = snapshot.data() as MessageDoc | undefined;
  if (!snapshot.exists() || !data || data.peerId !== user.uid) {
    return;
  }
  await updateDoc(ref, { text: trimmed, editedAt: Date.now() });
}

export async function deleteMessage(
  db: Firestore,
  channelId: string,
  user: AuthUser,
  id: string,
): Promise<void> {
  const ref = doc(db, 'channels', channelId, 'messages', id);
  const snapshot = await getDoc(ref);
  const data = snapshot.data() as MessageDoc | undefined;
  if (!snapshot.exists() || !data || data.peerId !== user.uid) {
    return;
  }
  await deleteDoc(ref);
}
