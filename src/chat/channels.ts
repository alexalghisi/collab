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
import { storage } from '../meeting/storage';
import type { ChatMessage } from '../signaling/events';
import { MAX_MESSAGE_CHARS } from './messages';

function generateId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** A persistent team conversation, shared by everyone signed in to this deployment. */
export interface Channel {
  readonly id: string;
  readonly name: string;
  readonly createdBy: string;
  readonly createdAt: number;
}

type ChannelDoc = Omit<Channel, 'id'>;
type MessageDoc = Omit<ChatMessage, 'id'>;

const CHANNELS_STORAGE_KEY = 'collab.teamChat.channels';
const MESSAGES_STORAGE_PREFIX = 'collab.teamChat.messages.';

export const DEFAULT_CHANNELS: readonly Channel[] = [
  {
    id: 'general',
    name: 'general',
    createdBy: 'system',
    createdAt: 1700000000000,
  },
  {
    id: 'random',
    name: 'random',
    createdBy: 'system',
    createdAt: 1700000001000,
  },
];

export const DEFAULT_MESSAGES: Record<string, readonly ChatMessage[]> = {
  general: [
    {
      id: 'welcome-1',
      peerId: 'system',
      displayName: 'Collab Bot',
      text: 'Welcome to Team Chat! Share ideas, discuss projects, or create a new channel to get started.',
      file: null,
      sentAt: 1700000002000,
    },
  ],
};

const channelListeners = new Set<(channels: Channel[]) => void>();
const messageListeners = new Map<string, Set<(messages: ChatMessage[]) => void>>();

let storageListenerRegistered = false;

function ensureStorageListener(): void {
  if (storageListenerRegistered) {
    return;
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
      if (event.key === CHANNELS_STORAGE_KEY) {
        const channels = readLocalChannels();
        channelListeners.forEach((listener) => listener(channels));
      } else if (event.key?.startsWith(MESSAGES_STORAGE_PREFIX)) {
        const channelId = event.key.slice(MESSAGES_STORAGE_PREFIX.length);
        const messages = readLocalMessages(channelId);
        const listeners = messageListeners.get(channelId);
        if (listeners) {
          listeners.forEach((listener) => listener(messages));
        }
      }
    });
    storageListenerRegistered = true;
  }
}

export function readLocalChannels(): Channel[] {
  try {
    const raw = storage.read(CHANNELS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as Channel[];
      }
    }
  } catch {
    // Ignore parse error and fall through to default
  }
  const initial = [...DEFAULT_CHANNELS];
  try {
    storage.write(CHANNELS_STORAGE_KEY, JSON.stringify(initial));
  } catch {
    // Ignore storage write error
  }
  return initial;
}

function writeLocalChannels(channels: Channel[]): void {
  try {
    storage.write(CHANNELS_STORAGE_KEY, JSON.stringify(channels));
  } catch {
    // Ignore
  }
  channelListeners.forEach((listener) => listener(channels));
}

export function readLocalMessages(channelId: string): ChatMessage[] {
  const key = `${MESSAGES_STORAGE_PREFIX}${channelId}`;
  try {
    const raw = storage.read(key);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed as ChatMessage[];
      }
    }
  } catch {
    // Ignore
  }
  const fallback = DEFAULT_MESSAGES[channelId] ? [...DEFAULT_MESSAGES[channelId]] : [];
  if (fallback.length > 0) {
    try {
      storage.write(key, JSON.stringify(fallback));
    } catch {
      // Ignore
    }
  }
  return fallback;
}

function writeLocalMessages(channelId: string, messages: ChatMessage[]): void {
  const key = `${MESSAGES_STORAGE_PREFIX}${channelId}`;
  try {
    storage.write(key, JSON.stringify(messages));
  } catch {
    // Ignore
  }
  const listeners = messageListeners.get(channelId);
  if (listeners) {
    listeners.forEach((listener) => listener(messages));
  }
}

export function clearLocalChatStore(): void {
  storage.remove(CHANNELS_STORAGE_KEY);
  channelListeners.clear();
  messageListeners.clear();
}

export function subscribeChannels(
  db: Firestore | null,
  listener: (channels: Channel[]) => void,
): Unsubscribe {
  if (db) {
    return onSnapshot(query(collection(db, 'channels'), orderBy('createdAt')), (snapshot) => {
      listener(snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as ChannelDoc) })));
    });
  }
  ensureStorageListener();
  channelListeners.add(listener);
  listener(readLocalChannels());
  return () => {
    channelListeners.delete(listener);
  };
}

export async function createChannel(
  db: Firestore | null,
  name: string,
  user: AuthUser,
): Promise<{ id: string }> {
  const sanitized = name.trim().replace(/^#+/, '');
  if (!sanitized) {
    throw new Error('Channel name cannot be empty');
  }
  if (db) {
    const channel: ChannelDoc = { name: sanitized, createdBy: user.uid, createdAt: Date.now() };
    const docRef = await addDoc(collection(db, 'channels'), channel);
    return { id: docRef.id };
  }
  const channels = readLocalChannels();
  const existing = channels.find((c) => c.name.toLowerCase() === sanitized.toLowerCase());
  if (existing) {
    return { id: existing.id };
  }
  const id = sanitized.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || generateId();
  const newChannel: Channel = {
    id,
    name: sanitized,
    createdBy: user.uid,
    createdAt: Date.now(),
  };
  writeLocalChannels([...channels, newChannel]);
  return { id };
}

export function subscribeMessages(
  db: Firestore | null,
  channelId: string,
  listener: (messages: ChatMessage[]) => void,
): Unsubscribe {
  if (db) {
    const messages = collection(db, 'channels', channelId, 'messages');
    return onSnapshot(query(messages, orderBy('sentAt')), (snapshot) => {
      listener(snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as MessageDoc) })));
    });
  }
  ensureStorageListener();
  let listeners = messageListeners.get(channelId);
  if (!listeners) {
    listeners = new Set();
    messageListeners.set(channelId, listeners);
  }
  listeners.add(listener);
  listener(readLocalMessages(channelId));
  return () => {
    listeners?.delete(listener);
    if (listeners && listeners.size === 0) {
      messageListeners.delete(channelId);
    }
  };
}

export function sendMessage(
  db: Firestore | null,
  channelId: string,
  user: AuthUser,
  text: string,
): Promise<unknown> {
  const trimmed = text.trim().slice(0, MAX_MESSAGE_CHARS);
  if (!trimmed) {
    return Promise.resolve();
  }
  if (db) {
    const message: MessageDoc = {
      peerId: user.uid,
      displayName: user.displayName,
      text: trimmed,
      file: null,
      sentAt: Date.now(),
    };
    return addDoc(collection(db, 'channels', channelId, 'messages'), message);
  }
  const current = readLocalMessages(channelId);
  const message: ChatMessage = {
    id: generateId(),
    peerId: user.uid,
    displayName: user.displayName || 'You',
    text: trimmed,
    file: null,
    sentAt: Date.now(),
  };
  writeLocalMessages(channelId, [...current, message]);
  return Promise.resolve(message);
}

export async function editMessage(
  db: Firestore | null,
  channelId: string,
  user: AuthUser,
  id: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim().slice(0, MAX_MESSAGE_CHARS);
  if (!trimmed) {
    return;
  }
  if (db) {
    const ref = doc(db, 'channels', channelId, 'messages', id);
    const snapshot = await getDoc(ref);
    const data = snapshot.data() as MessageDoc | undefined;
    if (!snapshot.exists() || !data || data.peerId !== user.uid) {
      return;
    }
    await updateDoc(ref, { text: trimmed, editedAt: Date.now() });
    return;
  }
  const current = readLocalMessages(channelId);
  const updated = current.map((msg) => {
    if (msg.id === id && (msg.peerId === user.uid || !msg.peerId)) {
      return { ...msg, text: trimmed, editedAt: Date.now() };
    }
    return msg;
  });
  writeLocalMessages(channelId, updated);
}

export async function deleteMessage(
  db: Firestore | null,
  channelId: string,
  user: AuthUser,
  id: string,
): Promise<void> {
  if (db) {
    const ref = doc(db, 'channels', channelId, 'messages', id);
    const snapshot = await getDoc(ref);
    const data = snapshot.data() as MessageDoc | undefined;
    if (!snapshot.exists() || !data || data.peerId !== user.uid) {
      return;
    }
    await deleteDoc(ref);
    return;
  }
  const current = readLocalMessages(channelId);
  const filtered = current.filter((msg) => msg.id !== id);
  writeLocalMessages(channelId, filtered);
}
