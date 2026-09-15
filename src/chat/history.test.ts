import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../signaling/events';
import {
  loadChatHistory,
  MAX_CHAT_HISTORY,
  mergeChatHistory,
  parseChatMessages,
  saveChatHistory,
} from './history';

const memory = new Map<string, string>();

const message = (id: string, sentAt: number, text = id): ChatMessage => ({
  id,
  peerId: 'peer',
  displayName: 'Ada',
  text,
  sentAt,
  file: null,
});

beforeEach(() => {
  memory.clear();
  const localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  vi.stubGlobal('window', { localStorage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chat history', () => {
  it('keeps a saved thread for the same room after a reload', () => {
    const thread = [message('a', 1, 'hello'), message('b', 2, 'still here')];

    saveChatHistory('room-1', thread);

    expect(loadChatHistory('room-1')).toEqual(thread);
    expect(loadChatHistory('room-2')).toEqual([]);
  });

  it('drops malformed entries instead of restoring them', () => {
    expect(parseChatMessages('{"id":"a"}')).toEqual([]);
    expect(parseChatMessages('not-json')).toEqual([]);
    expect(
      parseChatMessages(
        JSON.stringify([{ id: 'a', peerId: 'p', displayName: 'Ada', text: 'ok', sentAt: 1 }]),
      ),
    ).toEqual([]);
  });

  it('merges by id and keeps the most recent cap', () => {
    const first = Array.from({ length: MAX_CHAT_HISTORY }, (_, index) =>
      message(`old-${index}`, index),
    );
    const extra = message('new', MAX_CHAT_HISTORY, 'latest');

    const merged = mergeChatHistory(first, [first[0], extra]);

    expect(merged).toHaveLength(MAX_CHAT_HISTORY);
    expect(merged[0].id).toBe('old-1');
    expect(merged.at(-1)).toEqual(extra);
  });

  it('ignores a missing list so an older signaling server can still join', () => {
    const thread = [message('a', 1, 'hello')];

    expect(mergeChatHistory(thread, undefined, null)).toEqual(thread);
  });
});
