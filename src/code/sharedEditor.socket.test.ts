import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INITIAL_PEER_STATE } from '../signaling/events';
import type { SignalingChannel } from '../signaling/SignalingChannel';
import { settle, startRoomServer, until, type RoomServer } from '../testing/roomServer';
import { SharedCodeDocument } from './SharedCodeDocument';
import { STARTER_CODE } from './starterCode';

describe('the shared editor over the signaling server', () => {
  let server: RoomServer;

  beforeEach(async () => {
    server = await startRoomServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  /** The app builds the document before it dials, so `room:joined` reaches it. */
  async function arrive(
    sessionId: string,
    displayName: string,
  ): Promise<{ channel: SignalingChannel; document: SharedCodeDocument }> {
    const channel = server.connect({
      sessionId,
      roomId: 'room',
      displayName,
      state: INITIAL_PEER_STATE,
    });
    const document = new SharedCodeDocument(channel, { peerId: sessionId, displayName });
    await channel.connect();
    return { channel, document };
  }

  it('opens an empty room with the starter and hands it to whoever joins next', async () => {
    const ada = await arrive('a', 'Ada');
    await until(() => ada.document.text.toString() === STARTER_CODE.javascript);

    const linus = await arrive('b', 'Linus');

    await until(() => linus.document.text.toString() === STARTER_CODE.javascript);
    expect(linus.document.language).toBe('javascript');

    ada.document.destroy();
    linus.document.destroy();
    ada.channel.disconnect();
    linus.channel.disconnect();
  });

  it('switches the language and the starter for the other side too', async () => {
    const ada = await arrive('a', 'Ada');
    const linus = await arrive('b', 'Linus');
    await until(() => linus.document.text.toString() === STARTER_CODE.javascript);

    linus.document.setLanguage('cpp');
    await until(() => ada.document.language === 'cpp');
    expect(ada.document.text.toString()).toBe(STARTER_CODE.cpp);

    ada.document.setLanguage('go');
    await until(() => linus.document.language === 'go');
    expect(linus.document.text.toString()).toBe(STARTER_CODE.go);

    ada.document.destroy();
    linus.document.destroy();
    ada.channel.disconnect();
    linus.channel.disconnect();
  });

  it('gives a late joiner the document that is already there', async () => {
    const host = await server.join('a', 'Ada');
    const ada = new SharedCodeDocument(host.channel, {
      peerId: host.joined.selfPeerId,
      displayName: 'Ada',
    });
    ada.text.insert(0, 'function main() {}');
    ada.setLanguage('go');
    await settle();

    const channel = server.connect({
      sessionId: 'b',
      roomId: 'room',
      displayName: 'Linus',
      state: INITIAL_PEER_STATE,
    });
    const linus = new SharedCodeDocument(channel, { peerId: 'b', displayName: 'Linus' });
    await channel.connect();

    await until(() => linus.text.toString() === 'function main() {}');
    expect(linus.language).toBe('go');

    ada.destroy();
    linus.destroy();
    channel.disconnect();
  });
});
