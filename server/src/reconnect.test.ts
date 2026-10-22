import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startRoomServer, settle, until, type RoomServer } from '../../src/testing/roomServer';

describe('a participant whose connection drops', () => {
  let server: RoomServer;

  beforeEach(async () => {
    server = await startRoomServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  const dropTransport = (peerId: string): void => {
    server.io.sockets.sockets.get(peerId)?.conn.close();
  };

  it('keeps their seat and peer id when the connection comes back', async () => {
    const ada = await server.join('a', 'Ada');
    const linus = await server.join('b', 'Linus');
    // Let Linus's own arrival reach Ada before listening for a second one.
    await settle();
    const left: string[] = [];
    const joined: string[] = [];
    ada.channel.on('peer:left', (peerId) => left.push(peerId));
    ada.channel.on('peer:joined', (peer) => joined.push(peer.peerId));
    await settle();

    dropTransport(linus.joined.selfPeerId);
    await until(() => server.io.sockets.sockets.has(linus.joined.selfPeerId) === false);
    await until(() => server.io.sockets.sockets.has(linus.joined.selfPeerId), 5000);
    await settle();

    expect(left).toEqual([]);
    expect(joined).toEqual([]);
  });

  it('delivers signaling sent to them while they were away', async () => {
    const ada = await server.join('a', 'Ada');
    const linus = await server.join('b', 'Linus');
    const offers: string[] = [];
    linus.channel.on('signal:offer', ({ fromPeerId }) => offers.push(fromPeerId));
    // Recovery needs one broadcast first, so the client knows where to resume.
    ada.channel.emit('chat:message', { text: 'hi', file: null });
    await settle();

    dropTransport(linus.joined.selfPeerId);
    await until(() => server.io.sockets.sockets.has(linus.joined.selfPeerId) === false);
    ada.channel.emit('signal:offer', {
      targetPeerId: linus.joined.selfPeerId,
      description: { type: 'offer', sdp: 'restart' },
    });

    await until(() => offers.length === 1, 5000);
    expect(offers).toEqual([ada.joined.selfPeerId]);
  });

  it('frees the old seat at once when they come back under a new id', async () => {
    const ada = await server.join('a', 'Ada');
    const linus = await server.join('b', 'Linus');
    const left: string[] = [];
    ada.channel.on('peer:left', (peerId) => left.push(peerId));
    await settle();

    // A reload: the old socket is gone without a goodbye, a new one joins.
    dropTransport(linus.joined.selfPeerId);
    await until(() => !server.io.sockets.sockets.has(linus.joined.selfPeerId));
    linus.channel.disconnect();
    await settle();
    expect(left).toEqual([]);

    const again = await server.join('b', 'Linus');

    await until(() => left.includes(linus.joined.selfPeerId));
    expect(again.joined.peers.map((peer) => peer.displayName)).toEqual(['Ada']);
  });
});
