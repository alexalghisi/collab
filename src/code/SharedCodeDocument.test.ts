import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { removeAwarenessStates } from 'y-protocols/awareness';
import type { ServerToClientEvents } from '../signaling/events';
import type {
  OutgoingEvent,
  OutgoingPayload,
  SignalingChannel,
} from '../signaling/SignalingChannel';
import { EDITING_IDLE_MS, SharedCodeDocument } from './SharedCodeDocument';

type Handlers = {
  [E in keyof ServerToClientEvents]?: Array<ServerToClientEvents[E]>;
};

/**
 * Loopback transport standing in for the signaling channel: every peer attached
 * to the same bus receives what the others emit, and `online` drops traffic the
 * way a disconnected socket does.
 */
class Bus {
  private readonly peers: TestChannel[] = [];

  attach(): TestChannel {
    const channel = new TestChannel(this);
    this.peers.push(channel);
    return channel;
  }

  broadcast(from: TestChannel, event: OutgoingEvent, payload: unknown): void {
    for (const peer of this.peers) {
      if (peer !== from && peer.online) {
        peer.deliver(event as keyof ServerToClientEvents, payload);
      }
    }
  }
}

class TestChannel implements SignalingChannel {
  online = true;
  readonly sent: Array<{ event: OutgoingEvent; payload: unknown }> = [];
  private readonly handlers: Handlers = {};

  constructor(private readonly bus: Bus) {}

  on: SignalingChannel['on'] = (event, handler) => {
    const list = (this.handlers[event] ?? []) as Array<typeof handler>;
    list.push(handler);
    this.handlers[event] = list as Handlers[typeof event];
  };

  emit = <E extends OutgoingEvent>(event: E, payload: OutgoingPayload<E>): void => {
    if (!this.online) {
      return;
    }
    this.sent.push({ event, payload });
    this.bus.broadcast(this, event, payload);
  };

  connect(): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): void {
    this.online = false;
  }

  upload(): Promise<never> {
    throw new Error('this test never shares a file');
  }

  sendInvite(): Promise<never> {
    throw new Error('this test never sends an invite');
  }

  /** Replays what was buffered while offline, as a reconnecting transport would. */
  reconnect(): void {
    this.online = true;
  }

  deliver(event: keyof ServerToClientEvents, payload: unknown): void {
    for (const handler of this.handlers[event] ?? []) {
      (handler as (value: unknown) => void)(payload);
    }
  }
}

interface Peer {
  readonly channel: TestChannel;
  readonly document: SharedCodeDocument;
}

describe('SharedCodeDocument', () => {
  let bus: Bus;
  const peers: Peer[] = [];

  const attach = (peerId: string, displayName: string): Peer => {
    const channel = bus.attach();
    const document = new SharedCodeDocument(channel, { peerId, displayName });
    const peer = { channel, document };
    peers.push(peer);
    return peer;
  };

  beforeEach(() => {
    for (const peer of peers.splice(0)) {
      peer.document.destroy();
    }
    bus = new Bus();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('replicates an edit to every other participant', () => {
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');

    ada.document.text.insert(0, 'const answer = 42;');

    expect(linus.document.text.toString()).toBe('const answer = 42;');
  });

  it('converges when both sides type at the same position', () => {
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');
    ada.channel.online = false;
    linus.channel.online = false;

    ada.document.text.insert(0, 'left');
    linus.document.text.insert(0, 'right');

    ada.channel.reconnect();
    linus.channel.reconnect();
    ada.document.publishState();
    linus.document.publishState();

    expect(ada.document.text.toString()).toBe(linus.document.text.toString());
    expect(ada.document.text.toString()).toHaveLength('leftright'.length);
  });

  it('keeps edits made while disconnected and merges them on reconnect', () => {
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');
    ada.document.text.insert(0, 'shared\n');

    linus.channel.online = false;
    ada.document.text.insert(ada.document.text.length, 'while you were away\n');
    linus.document.text.insert(linus.document.text.length, 'offline edit\n');
    linus.channel.reconnect();
    linus.document.publishState();
    ada.document.publishState();

    expect(linus.document.text.toString()).toContain('while you were away');
    expect(ada.document.text.toString()).toContain('offline edit');
    expect(ada.document.text.toString()).toBe(linus.document.text.toString());
  });

  it('ignores a replayed update instead of duplicating text', () => {
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');
    ada.document.text.insert(0, 'once');
    const [update] = ada.channel.sent
      .filter((entry) => entry.event === 'code:update')
      .map((entry) => entry.payload as string);

    linus.channel.deliver('code:update', update);
    linus.channel.deliver('code:update', update);

    expect(linus.document.text.toString()).toBe('once');
  });

  it('does not echo a remote update back onto the channel', () => {
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');

    ada.document.text.insert(0, 'no echo');

    expect(linus.channel.sent.filter((entry) => entry.event === 'code:update')).toHaveLength(0);
  });

  it('brings a late joiner up to date from the merged state', () => {
    const ada = attach('a', 'Ada');
    ada.document.text.insert(0, 'function main() {}');
    ada.document.setLanguage('go');

    const late = attach('c', 'Grace');
    late.document.applyState(ada.document.encodeState());

    expect(late.document.text.toString()).toBe('function main() {}');
    expect(late.document.language).toBe('go');
  });

  it('does not publish an empty document when the room has no code yet', () => {
    const ada = attach('a', 'Ada');
    ada.channel.sent.length = 0;
    ada.channel.deliver('room:joined', { code: null });

    expect(ada.channel.sent.filter((entry) => entry.event === 'code:update')).toEqual([]);
  });

  it('loads the room snapshot before publishing so a joiner cannot blank it', () => {
    const ada = attach('a', 'Ada');
    ada.document.text.insert(0, 'function main() {}');
    const snapshot = ada.document.encodeState();
    ada.channel.sent.length = 0;

    const late = attach('c', 'Grace');
    late.channel.deliver('room:joined', { code: snapshot });

    expect(late.document.text.toString()).toBe('function main() {}');
    expect(ada.document.text.toString()).toBe('function main() {}');
  });

  it('shares the selected language with the room', () => {
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');
    const seen: string[] = [];
    linus.document.onChange(() => seen.push(linus.document.language));

    ada.document.setLanguage('python');

    expect(linus.document.language).toBe('python');
    expect(seen).toContain('python');
  });

  it('publishes presence and drops it when the peer goes away', () => {
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');

    linus.document.announce();
    expect(ada.document.presence().map((entry) => entry.displayName)).toEqual(['Linus']);

    linus.document.destroy();
    expect(ada.document.presence()).toEqual([]);
  });

  it('keeps a remote caret on the same character after text is inserted in front', () => {
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');
    ada.document.text.insert(0, 'hello world');
    linus.document.setSelection({ start: 6, end: 6 });

    ada.document.text.insert(0, 'xxx');

    expect(ada.document.presence()[0]?.selection).toEqual({ start: 9, end: 9, head: 9 });
  });

  it('does not drag a caret along when someone else types at it', () => {
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');
    ada.document.text.insert(0, 'hello');
    ada.document.setSelection({ start: 5, end: 5, head: 5 });

    linus.document.text.insert(5, '\nnext');

    expect(linus.document.text.toString()).toBe('hello\nnext');
    expect(linus.document.presence()[0]?.selection).toEqual({ start: 5, end: 5, head: 5 });
  });

  it('moves a remote caret along as its author types', () => {
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');
    ada.document.text.insert(0, 'hello');
    linus.document.setSelection({ start: 0, end: 0, head: 0 });

    linus.document.text.insert(0, 'X');
    linus.document.setSelection({ start: 1, end: 1, head: 1 });

    expect(ada.document.text.toString()).toBe('Xhello');
    expect(ada.document.presence()[0]?.selection).toEqual({ start: 1, end: 1, head: 1 });
  });

  it('shows the room who is typing, and stops once they do', () => {
    vi.useFakeTimers();
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');

    linus.document.noteEditing();
    expect(ada.document.presence()[0]?.editing).toBe(true);

    vi.advanceTimersByTime(EDITING_IDLE_MS);
    expect(ada.document.presence()[0]?.editing).toBe(false);
  });

  it('stays marked as typing across the gaps between keystrokes', () => {
    vi.useFakeTimers();
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');

    linus.document.noteEditing();
    vi.advanceTimersByTime(EDITING_IDLE_MS - 100);
    linus.document.noteEditing();
    vi.advanceTimersByTime(EDITING_IDLE_MS - 100);

    expect(ada.document.presence()[0]?.editing).toBe(true);
  });

  it('announces typing once, not on every keystroke', () => {
    vi.useFakeTimers();
    attach('a', 'Ada');
    const linus = attach('b', 'Linus');
    linus.document.noteEditing();
    const announced = linus.channel.sent.length;

    linus.document.noteEditing();

    expect(linus.channel.sent).toHaveLength(announced);
  });

  it('stops claiming to be typing after its author leaves', () => {
    vi.useFakeTimers();
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');
    linus.document.noteEditing();

    linus.document.destroy();
    vi.advanceTimersByTime(EDITING_IDLE_MS * 2);

    expect(ada.document.presence()).toEqual([]);
  });

  it('does not ask the room to drop a cursor it merely stopped hearing from', () => {
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');
    const grace = attach('c', 'Grace');
    linus.document.setSelection({ start: 1, end: 1 });
    ada.channel.sent.length = 0;

    // Awareness expires a peer that has gone quiet, on that client alone.
    removeAwarenessStates(ada.document.awareness, [linus.document.doc.clientID], 'timeout');

    expect(ada.channel.sent).toEqual([]);
    expect(grace.document.presence().map((entry) => entry.displayName)).toContain('Linus');
  });

  it('gives each participant a stable colour derived from their peer id', () => {
    const ada = attach('a', 'Ada');
    const same = attach('a', 'Ada on another tab');

    expect(ada.document.color).toBe(same.document.color);
  });

  it('stops sending after destroy', () => {
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');
    ada.document.destroy();

    ada.document.text.insert(0, 'after teardown');

    expect(linus.document.text.toString()).toBe('');
  });

  it('replaces the whole buffer in one edit the others see', () => {
    const ada = attach('a', 'Ada');
    const linus = attach('b', 'Linus');
    ada.document.text.insert(0, 'function add(a,b){return a+b;}');

    ada.document.replaceText('function add(a, b) {\n  return a + b;\n}');

    expect(ada.document.text.toString()).toBe('function add(a, b) {\n  return a + b;\n}');
    expect(linus.document.text.toString()).toBe(ada.document.text.toString());
  });
});
