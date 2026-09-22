import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/types';
import {
  clearLocalChatStore,
  createChannel,
  deleteMessage,
  editMessage,
  readLocalChannels,
  readLocalMessages,
  sendMessage,
  subscribeChannels,
  subscribeMessages,
  type Channel,
} from './channels';
import type { ChatMessage } from '../signaling/events';

const memory = new Map<string, string>();

const mockUser: AuthUser = {
  uid: 'user-1',
  email: 'ada@example.com',
  displayName: 'Ada Lovelace',
  photoURL: null,
};

beforeEach(() => {
  memory.clear();
  const store = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  };
  vi.stubGlobal('sessionStorage', store);
  vi.stubGlobal('window', { localStorage: store });
  clearLocalChatStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local channel and team chat fallback store', () => {
  it('seeds default channels when local storage is empty', () => {
    const channels = readLocalChannels();
    expect(channels.length).toBeGreaterThanOrEqual(2);
    expect(channels.map((c) => c.name)).toContain('general');
    expect(channels.map((c) => c.name)).toContain('random');
  });

  it('subscribes to channels and notifies on channel creation', async () => {
    const snapshots: Channel[][] = [];
    const unsubscribe = subscribeChannels(null, (channels) => {
      snapshots.push(channels);
    });

    expect(snapshots.length).toBe(1);
    expect(snapshots[0].map((c) => c.name)).toContain('general');

    const created = await createChannel(null, 'engineering', mockUser);
    expect(created.id).toBe('engineering');

    expect(snapshots.length).toBe(2);
    expect(snapshots[1].map((c) => c.name)).toContain('engineering');

    unsubscribe();
  });

  it('creates and delivers messages in a channel', async () => {
    const messageSnapshots: ChatMessage[][] = [];
    const unsubscribe = subscribeMessages(null, 'general', (messages) => {
      messageSnapshots.push(messages);
    });

    expect(messageSnapshots.length).toBe(1);
    expect(messageSnapshots[0][0].text).toContain('Welcome to Team Chat');

    await sendMessage(null, 'general', mockUser, 'Hello world!');

    expect(messageSnapshots.length).toBe(2);
    const latest = messageSnapshots[1];
    expect(latest[latest.length - 1].text).toBe('Hello world!');
    expect(latest[latest.length - 1].peerId).toBe(mockUser.uid);
    expect(latest[latest.length - 1].displayName).toBe(mockUser.displayName);

    unsubscribe();
  });

  it('edits messages sent by the user', async () => {
    await sendMessage(null, 'general', mockUser, 'Original message');
    const messages = readLocalMessages('general');
    const sent = messages[messages.length - 1];

    await editMessage(null, 'general', mockUser, sent.id, 'Edited message');

    const updated = readLocalMessages('general');
    const edited = updated.find((m) => m.id === sent.id);
    expect(edited?.text).toBe('Edited message');
    expect(edited?.editedAt).toBeDefined();
  });

  it('deletes messages from the channel', async () => {
    await sendMessage(null, 'general', mockUser, 'To be deleted');
    const messages = readLocalMessages('general');
    const target = messages[messages.length - 1];

    await deleteMessage(null, 'general', mockUser, target.id);

    const remaining = readLocalMessages('general');
    expect(remaining.find((m) => m.id === target.id)).toBeUndefined();
  });
});
