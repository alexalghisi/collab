import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle, startRoomServer, until, type RoomServer } from '../testing/roomServer';
import { DEFAULT_ROOM_SETTINGS, type RoomSettings } from './events';

/**
 * Opening the editor or the whiteboard is the host's move on the whole room,
 * so it is asserted over the transport the room actually uses.
 */
describe('the shared stage over the Socket.IO transport', () => {
  let server: RoomServer;

  beforeEach(async () => {
    server = await startRoomServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('starts every room on the tiles', async () => {
    const host = await server.join('a', 'Ada');

    expect(host.joined.settings).toEqual(DEFAULT_ROOM_SETTINGS);
  });

  it('takes the room to the surface the host opened', async () => {
    const host = await server.join('a', 'Ada');
    const guest = await server.join('b', 'Linus');
    const seen: RoomSettings[] = [];
    guest.channel.on('room:settings', (settings) => seen.push(settings));

    host.channel.emit('room:settings', { ...DEFAULT_ROOM_SETTINGS, stage: 'code' });

    await until(() => seen.length === 1);
    expect(seen[0].stage).toBe('code');
  });

  it('ignores a stage change from someone who is not the host', async () => {
    const host = await server.join('a', 'Ada');
    const guest = await server.join('b', 'Linus');
    const seen: RoomSettings[] = [];
    host.channel.on('room:settings', (settings) => seen.push(settings));

    guest.channel.emit('room:settings', { ...DEFAULT_ROOM_SETTINGS, stage: 'whiteboard' });
    await settle();

    expect(seen).toEqual([]);
  });

  it('tells a late joiner what the room is already looking at', async () => {
    const host = await server.join('a', 'Ada');
    host.channel.emit('room:settings', { ...DEFAULT_ROOM_SETTINGS, stage: 'whiteboard' });
    await settle();

    const late = await server.join('c', 'Grace');

    expect(late.joined.settings.stage).toBe('whiteboard');
  });
});
