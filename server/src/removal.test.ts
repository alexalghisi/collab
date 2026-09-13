import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../src/signaling/events';
import { startRoomServer, settle, type RoomServer } from '../../src/testing/roomServer';

describe('removing a participant', () => {
  let server: RoomServer;

  beforeEach(async () => {
    server = await startRoomServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('stops the removed participant reaching the room', async () => {
    const host = await server.join('a', 'Ada');
    const guest = await server.join('b', 'Linus');
    const messages: ChatMessage[] = [];
    const updates: string[] = [];
    host.channel.on('chat:message', (message) => messages.push(message));
    host.channel.on('code:update', (update) => updates.push(update));
    await settle();

    host.channel.emit('host:command', {
      targetPeerId: guest.joined.selfPeerId,
      command: { action: 'remove' },
    });
    await settle();

    guest.channel.emit('chat:message', 'still here');
    guest.channel.emit('code:update', 'AAAA');
    await settle();

    expect(messages).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('tells the removed participant and the room straight away', async () => {
    const host = await server.join('a', 'Ada');
    const guest = await server.join('b', 'Linus');
    const other = await server.join('c', 'Grace');
    const removed = new Promise<{ action: string }>((resolve) =>
      guest.channel.on('host:command', resolve),
    );
    const left = new Promise<string>((resolve) => other.channel.on('peer:left', resolve));

    host.channel.emit('host:command', {
      targetPeerId: guest.joined.selfPeerId,
      command: { action: 'remove' },
    });

    expect((await removed).action).toBe('remove');
    expect(await left).toBe(guest.joined.selfPeerId);
  });

  it('refuses to let the removed session back in', async () => {
    const host = await server.join('a', 'Ada');
    const guest = await server.join('b', 'Linus');
    host.channel.emit('host:command', {
      targetPeerId: guest.joined.selfPeerId,
      command: { action: 'remove' },
    });
    await settle();
    guest.channel.disconnect();

    await expect(server.join('b', 'Linus')).rejects.toThrow();
  });

  it('ignores a removal sent by someone who is not the host', async () => {
    const host = await server.join('a', 'Ada');
    const guest = await server.join('b', 'Linus');
    const other = await server.join('c', 'Grace');
    const messages: ChatMessage[] = [];
    host.channel.on('chat:message', (message) => messages.push(message));

    guest.channel.emit('host:command', {
      targetPeerId: other.joined.selfPeerId,
      command: { action: 'remove' },
    });
    await settle();
    other.channel.emit('chat:message', 'still allowed');
    await settle();

    expect(messages.map((message) => message.text)).toEqual(['still allowed']);
  });

  it('leaves a muted participant able to take part', async () => {
    const host = await server.join('a', 'Ada');
    const guest = await server.join('b', 'Linus');
    const messages: ChatMessage[] = [];
    host.channel.on('chat:message', (message) => messages.push(message));

    host.channel.emit('host:command', {
      targetPeerId: guest.joined.selfPeerId,
      command: { action: 'mute' },
    });
    await settle();
    guest.channel.emit('chat:message', 'muted, not gone');
    await settle();

    expect(messages.map((message) => message.text)).toEqual(['muted, not gone']);
  });
});
