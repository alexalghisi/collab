import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FileAttachment } from '../../../src/files/attachments';
import { settle, startRoomServer, type RoomServer } from '../../../src/testing/roomServer';

/** Uploads are authorised by room membership, which only the server knows. */
describe('sharing a file with the room', () => {
  let server: RoomServer;
  const roomId = 'uploads-room';

  const send = (sessionId: string) => {
    const form = new FormData();
    form.append('roomId', roomId);
    form.append('sessionId', sessionId);
    form.append('file', new Blob(['a diagram'], { type: 'image/png' }), 'diagram.png');
    return fetch(`${server.url}/files`, { method: 'POST', body: form });
  };

  beforeEach(async () => {
    server = await startRoomServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('accepts a file from a participant of the room', async () => {
    await server.join('a', 'Ada', roomId);

    const response = await send('a');
    const attachment = (await response.json()) as FileAttachment;

    expect(response.status).toBe(201);
    expect(await (await fetch(`${server.url}${attachment.url}`)).text()).toBe('a diagram');
  });

  it('refuses a session that never joined the room', async () => {
    await server.join('a', 'Ada', roomId);

    expect((await send('somebody-else')).status).toBe(403);
  });

  it('refuses a participant the host removed', async () => {
    const host = await server.join('a', 'Ada', roomId);
    const guest = await server.join('b', 'Linus', roomId);
    expect((await send('b')).status).toBe(201);

    host.channel.emit('host:command', {
      targetPeerId: guest.joined.selfPeerId,
      command: { action: 'remove' },
    });
    await settle();

    expect((await send('b')).status).toBe(403);
  });

  it('forgets the room\u2019s files once everybody has left', async () => {
    const host = await server.join('a', 'Ada', roomId);
    const attachment = (await (await send('a')).json()) as FileAttachment;
    host.channel.disconnect();
    await settle();

    expect((await fetch(`${server.url}${attachment.url}`)).status).toBe(404);
  });
});
