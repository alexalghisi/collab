import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import type { AuthUser } from '../auth/types';
import type { ChatMessage } from '../signaling/events';

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
    sentAt: Date.now(),
  };
  return addDoc(collection(db, 'channels', channelId, 'messages'), message);
}
