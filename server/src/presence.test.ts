import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startRoomServer, type RoomServer } from '../../src/testing/roomServer';
import { isSameOccupant } from './SignalingServer';

describe('isSameOccupant', () => {
  it('matches a session, an account, or the same display name', () => {
    expect(isSameOccupant({ sessionId: 'a' }, { sessionId: 'a' })).toBe(true);
    expect(isSameOccupant({ accountId: 'u1' }, { accountId: 'u1' })).toBe(true);
    expect(isSameOccupant({ displayName: ' Ada ' }, { displayName: 'ada' })).toBe(true);
    expect(isSameOccupant({ sessionId: 'a' }, { sessionId: 'b', displayName: 'Ada' })).toBe(false);
  });
});

describe('one seat per person', () => {
  let server: RoomServer;

  beforeEach(async () => {
    server = await startRoomServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('replaces a stale socket of the same session instead of leaving two tiles', async () => {
    const first = await server.join('a', 'Ada');
    const replaced = new Promise<void>((resolve) => first.channel.on('session:replaced', resolve));

    const second = await server.join('a', 'Ada');
    await replaced;

    expect(second.joined.peers.some((peer) => peer.displayName === 'Ada')).toBe(false);
  });

  it('lets a later join with the same name take the earlier seat', async () => {
    await server.join('a', 'Ada');
    const guest = await server.join('c', 'Linus');
    const left = new Promise<void>((resolve) => guest.channel.on('peer:left', () => resolve()));
    await server.join('b', 'Ada');
    await left;
  });
});
