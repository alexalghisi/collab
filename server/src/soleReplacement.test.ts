import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startRoomServer, settle, until, type RoomServer } from '../../src/testing/roomServer';

describe('the only participant opening the room again', () => {
  let server: RoomServer;

  beforeEach(async () => {
    server = await startRoomServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('keeps the room content when a second tab takes the seat', async () => {
    const ada = await server.join('a', 'Ada');
    ada.channel.emit('chat:message', { text: 'keep me', file: null });
    await settle();

    const again = await server.join('a', 'Ada');

    expect(again.joined.messages.map((message) => message.text)).toEqual(['keep me']);
    expect(again.joined.hostPeerId).toBe(again.joined.selfPeerId);
  });

  it('keeps the room content when a reload replaces a dropped connection', async () => {
    const ada = await server.join('a', 'Ada');
    ada.channel.emit('chat:message', { text: 'keep me', file: null });
    await settle();

    server.io.sockets.sockets.get(ada.joined.selfPeerId)?.conn.close();
    await until(() => !server.io.sockets.sockets.has(ada.joined.selfPeerId));
    ada.channel.disconnect();
    await settle();

    const again = await server.join('a', 'Ada');

    expect(again.joined.messages.map((message) => message.text)).toEqual(['keep me']);
    expect(again.joined.hostPeerId).toBe(again.joined.selfPeerId);
  });
});
