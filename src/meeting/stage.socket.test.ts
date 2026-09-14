import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '../signaling/events';
import { startRoomServer, until, type RoomServer } from '../testing/roomServer';
import type { MeetingStage } from './stage';

describe('the surface the room is on', () => {
  let server: RoomServer;
  const roomId = 'stage-room';

  beforeEach(async () => {
    server = await startRoomServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('takes the room to the editor the host opened', async () => {
    const host = await server.join('a', 'Ada', roomId);
    const guest = await server.join('b', 'Linus', roomId);
    const seen: MeetingStage[] = [];
    guest.channel.on('stage:focus', (stage) => seen.push(stage));

    host.channel.emit('stage:focus', 'code');
    await until(() => seen.length === 1);

    expect(seen).toEqual(['code']);
  });

  it('keeps a guest from moving anybody else', async () => {
    const host = await server.join('a', 'Ada', roomId);
    const guest = await server.join('b', 'Linus', roomId);
    const stages: MeetingStage[] = [];
    const messages: ChatMessage[] = [];
    host.channel.on('stage:focus', (stage) => stages.push(stage));
    host.channel.on('chat:message', (message) => messages.push(message));

    guest.channel.emit('stage:focus', 'whiteboard');
    // The room echoes chat back, so this arriving proves the move was handled.
    guest.channel.emit('chat:message', { text: 'still here', file: null });
    await until(() => messages.length === 1);

    expect(stages).toEqual([]);
  });

  it('lands a late joiner where the host already is', async () => {
    const host = await server.join('a', 'Ada', roomId);
    const guest = await server.join('b', 'Linus', roomId);
    const seen: MeetingStage[] = [];
    guest.channel.on('stage:focus', (stage) => seen.push(stage));

    host.channel.emit('stage:focus', 'whiteboard');
    await until(() => seen.length === 1);
    const late = await server.join('c', 'Grace', roomId);

    expect(late.joined.stage).toBe('whiteboard');
  });

  it('ignores a stage the room does not have', async () => {
    const host = await server.join('a', 'Ada', roomId);
    const guest = await server.join('b', 'Linus', roomId);
    const seen: MeetingStage[] = [];
    guest.channel.on('stage:focus', (stage) => seen.push(stage));

    host.channel.emit('stage:focus', 'slides' as MeetingStage);
    host.channel.emit('stage:focus', 'code');
    await until(() => seen.length === 1);

    expect(seen).toEqual(['code']);
  });
});
