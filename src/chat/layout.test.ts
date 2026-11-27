import { describe, expect, it } from 'vitest';
import { CHAT_GROUP_WINDOW_MS, chatInitial, sendsOnKey, startsChatGroup } from './layout';

const message = { peerId: 'a', displayName: 'Ada', sentAt: 1_000 };

describe('chat layout', () => {
  it('opens a group for the first message, a new author or a long pause', () => {
    expect(startsChatGroup(undefined, message)).toBe(true);
    expect(startsChatGroup(message, { ...message, sentAt: 2_000 })).toBe(false);
    expect(startsChatGroup(message, { ...message, peerId: 'b' })).toBe(true);
    expect(startsChatGroup(message, { ...message, displayName: 'Linus' })).toBe(true);
    expect(
      startsChatGroup(message, { ...message, sentAt: message.sentAt + CHAT_GROUP_WINDOW_MS + 1 }),
    ).toBe(true);
  });

  it('shows one capital letter for an avatar', () => {
    expect(chatInitial('  mateicheveresan1')).toBe('M');
    expect(chatInitial('șerban')).toBe('Ș');
    expect(chatInitial('')).toBe('?');
  });

  it('sends on Enter and keeps Shift+Enter for a new line', () => {
    expect(sendsOnKey({ key: 'Enter' })).toBe(true);
    expect(sendsOnKey({ key: 'Enter', shiftKey: true })).toBe(false);
    expect(sendsOnKey({ key: 'Enter', isComposing: true })).toBe(false);
    expect(sendsOnKey({ key: 'a' })).toBe(false);
  });
});
