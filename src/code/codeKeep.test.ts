import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SignalingChannel } from '../signaling/SignalingChannel';
import type { CodeStore } from './codeStore';
import { CODE_SAVE_DELAY_MS, SharedCodeDocument } from './SharedCodeDocument';
import { starterCode } from './starterCode';

class Channel {
  readonly sent: Array<{ event: string; payload: unknown }> = [];
  private readonly handlers = new Map<string, Array<(value: unknown) => void>>();

  on = (event: string, handler: (value: unknown) => void): void => {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  };

  emit = (event: string, payload: unknown): void => {
    this.sent.push({ event, payload });
  };

  deliver(event: string, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  }
}

function memoryStore(): CodeStore & { value: string | null; saves: number } {
  const store = {
    value: null as string | null,
    saves: 0,
    load: () => store.value,
    save: (state: string) => {
      store.value = state;
      store.saves += 1;
    },
  };
  return store;
}

function open(store: CodeStore, peerId = 'a') {
  const channel = new Channel();
  const document = new SharedCodeDocument(
    channel as unknown as SignalingChannel,
    { peerId, displayName: peerId },
    store,
  );
  return { channel, document };
}

const emptyRoom = { code: null, selfPeerId: 'me', hostPeerId: 'me', peers: [] };

describe('code that outlives the meeting', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('brings the code, the input and the language back after everyone left', () => {
    const store = memoryStore();
    const first = open(store);
    first.channel.deliver('room:joined', emptyRoom);
    first.document.setLanguage('cpp');
    first.document.replaceText('int main() { return 7; }\n');
    first.document.replaceStdin('4 6\n');
    first.document.destroy();

    const second = open(store);
    expect(second.document.text.toString()).toBe('int main() { return 7; }\n');
    second.channel.deliver('room:joined', emptyRoom);

    expect(second.document.text.toString()).toBe('int main() { return 7; }\n');
    expect(second.document.stdin.toString()).toBe('4 6\n');
    expect(second.document.language).toBe('cpp');
    const published = second.channel.sent.filter((item) => item.event === 'code:update');
    expect(published.length).toBeGreaterThan(0);
    second.document.destroy();
  });

  it('saves while typing, without waiting for the meeting to end', () => {
    vi.useFakeTimers();
    const store = memoryStore();
    const { document } = open(store);
    document.replaceText('print(1)\n');
    expect(store.value).toBeNull();
    vi.advanceTimersByTime(CODE_SAVE_DELAY_MS);
    expect(store.saves).toBe(1);

    const reopened = open(store, 'b');
    expect(reopened.document.text.toString()).toBe('print(1)\n');
    document.destroy();
    reopened.document.destroy();
  });

  it('does not store an untouched starter program', () => {
    const store = memoryStore();
    const { channel, document } = open(store);
    channel.deliver('room:joined', emptyRoom);
    expect(document.text.toString()).toBe(starterCode(document.language));
    document.destroy();
    expect(store.value).toBeNull();
  });

  it('remembers that the editor was emptied on purpose', () => {
    const store = memoryStore();
    const first = open(store);
    first.document.replaceText('keep me');
    first.document.replaceText('');
    first.document.destroy();

    const second = open(store, 'b');
    expect(second.document.text.toString()).toBe('');
    second.document.destroy();
  });

  it('agrees with the room when the server still has the same document', () => {
    const store = memoryStore();
    const first = open(store);
    first.document.replaceText('shared line\n');
    const serverState = first.document.encodeState();
    first.document.destroy();

    const second = open(store, 'b');
    second.channel.deliver('room:joined', { ...emptyRoom, code: serverState });
    expect(second.document.text.toString()).toBe('shared line\n');
    second.document.destroy();
  });

  it('ignores a damaged saved copy', () => {
    const store = memoryStore();
    store.value = '%%%not-a-document%%%';
    const { document } = open(store);
    expect(document.text.toString()).toBe('');
    document.destroy();
  });
});
