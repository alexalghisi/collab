import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle, startRoomServer, until, type RoomServer } from '../testing/roomServer';
import type { TranscriptSegment } from './segments';

const turn = (id: string, text: string, peerId = 'ignored'): TranscriptSegment => ({
  id,
  peerId,
  displayName: 'Impostor',
  text,
  startedAt: 1_000,
  endedAt: 2_000,
});

describe('live captions over the Socket.IO transport', () => {
  let server: RoomServer;

  beforeEach(async () => {
    server = await startRoomServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('relays a turn to the whole room, attributed to the speaker', async () => {
    const ada = await server.join('a', 'Ada');
    const linus = await server.join('b', 'Linus');
    const heard: TranscriptSegment[] = [];
    linus.channel.on('transcript:segment', (segment) => heard.push(segment));

    ada.channel.emit('transcript:segment', turn('t1', 'Ship the invite link.'));
    await until(() => heard.length === 1);

    expect(heard[0]).toMatchObject({
      id: 't1',
      text: 'Ship the invite link.',
      displayName: 'Ada',
      peerId: ada.joined.selfPeerId,
    });
  });

  it('replays the log to a late joiner', async () => {
    const ada = await server.join('a', 'Ada');
    ada.channel.emit('transcript:segment', turn('t1', 'We decided on Thursday.'));
    await settle();

    const late = await server.join('b', 'Linus');

    expect(late.joined.transcript).toHaveLength(1);
    expect(late.joined.transcript[0].text).toBe('We decided on Thursday.');
    expect(late.joined.transcript[0].displayName).toBe('Ada');
  });

  it('drops an empty turn instead of broadcasting it', async () => {
    const ada = await server.join('a', 'Ada');
    const linus = await server.join('b', 'Linus');
    let seen = false;
    linus.channel.on('transcript:segment', () => {
      seen = true;
    });

    ada.channel.emit('transcript:segment', turn('t1', '   '));
    await settle();

    expect(seen).toBe(false);
  });

  it('stops a removed participant adding further turns', async () => {
    const host = await server.join('a', 'Ada');
    const guest = await server.join('b', 'Linus');
    const heard: TranscriptSegment[] = [];
    host.channel.on('transcript:segment', (segment) => heard.push(segment));
    host.channel.emit('host:command', {
      targetPeerId: guest.joined.selfPeerId,
      command: { action: 'remove' },
    });
    await settle();

    guest.channel.emit('transcript:segment', turn('t2', 'I am still here.'));
    await settle();

    expect(heard).toEqual([]);
  });
});
