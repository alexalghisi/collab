import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FileAttachment } from '../../src/files/attachments';
import type { ChatMessage } from '../../src/signaling/events';
import { settle, startRoomServer, type RoomServer } from '../../src/testing/roomServer';

describe('sending a message with a file', () => {
  let server: RoomServer;
  const roomId = 'chat-room';

  const upload = async (sessionId: string, room = roomId): Promise<FileAttachment> => {
    const form = new FormData();
    form.append('roomId', room);
    form.append('sessionId', sessionId);
    form.append('file', new Blob(['a diagram'], { type: 'image/png' }), 'diagram.png');
    const response = await fetch(`${server.url}/files`, { method: 'POST', body: form });
    return (await response.json()) as FileAttachment;
  };

  beforeEach(async () => {
    server = await startRoomServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('relays the message and the file to the whole room', async () => {
    const host = await server.join('a', 'Ada', roomId);
    const guest = await server.join('b', 'Linus', roomId);
    const seen: ChatMessage[] = [];
    host.channel.on('chat:message', (message) => seen.push(message));
    const attachment = await upload('b');

    guest.channel.emit('chat:message', { text: 'the diagram', file: attachment });
    await settle();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      displayName: 'Linus',
      text: 'the diagram',
      file: { name: 'diagram.png', mimeType: 'image/png', size: 9 },
    });
    expect(await (await fetch(`${server.url}${seen[0].file?.url}`)).text()).toBe('a diagram');
  });

  it('describes the file from the store rather than from the sender', async () => {
    const host = await server.join('a', 'Ada', roomId);
    const guest = await server.join('b', 'Linus', roomId);
    const seen: ChatMessage[] = [];
    host.channel.on('chat:message', (message) => seen.push(message));
    const attachment = await upload('b');

    guest.channel.emit('chat:message', {
      text: 'trust me',
      file: {
        ...attachment,
        name: 'invoice.pdf',
        mimeType: 'application/pdf',
        size: 1,
        url: 'https://example.com/elsewhere',
      },
    });
    await settle();

    expect(seen[0].file).toEqual(attachment);
  });

  it('drops a message pointing at a file the sender did not upload', async () => {
    const host = await server.join('a', 'Ada', roomId);
    const guest = await server.join('b', 'Linus', roomId);
    const seen: ChatMessage[] = [];
    host.channel.on('chat:message', (message) => seen.push(message));
    const mine = await upload('a');

    guest.channel.emit('chat:message', { text: 'not mine', file: mine });
    guest.channel.emit('chat:message', { text: 'made up', file: { ...mine, id: 'no-such-file' } });
    await settle();

    expect(seen).toHaveLength(0);
  });

  it('ignores a message with nothing in it', async () => {
    const host = await server.join('a', 'Ada', roomId);
    const seen: ChatMessage[] = [];
    host.channel.on('chat:message', (message) => seen.push(message));

    host.channel.emit('chat:message', { text: '   ', file: null });
    await settle();

    expect(seen).toHaveLength(0);
  });
});
