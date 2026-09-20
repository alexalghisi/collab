import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INITIAL_PEER_STATE } from '../signaling/events';
import { settle, startRoomServer, until, type RoomServer } from '../testing/roomServer';
import { SharedCodeDocument } from './SharedCodeDocument';

describe('the shared editor over the signaling server', () => {
  let server: RoomServer;

  beforeEach(async () => {
    server = await startRoomServer();
  });

  afterEach(async () => {
    await server.stop();
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
