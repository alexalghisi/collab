import { beforeEach, describe, expect, it } from 'vitest';
import type { ServerToClientEvents } from '../signaling/events';
import type {
  OutgoingEvent,
  OutgoingPayload,
  SignalingChannel,
} from '../signaling/SignalingChannel';
import { SharedCodeDocument } from './SharedCodeDocument';

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
});
