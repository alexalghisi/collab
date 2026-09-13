import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES, type FileAttachment } from '../../../src/files/attachments';
import { RateLimiter } from '../execution/RateLimiter';
import { FileStore } from './FileStore';
import { filesRouter, type Membership } from './router';

describe('the file endpoint', () => {
  let http: Server;
  let base: string;

  const serve = async (store: FileStore, membership: Membership, limiter?: RateLimiter) => {
    const app = express();
    app.use(filesRouter({ store, membership, limiter }));
    http = app.listen(0);
    await once(http, 'listening');
    base = `http://localhost:${(http.address() as AddressInfo).port}`;
  };

  const send = (
    body: Blob,
    fields: { roomId?: string; sessionId?: string; name?: string } = {},
  ) => {
    const { roomId = 'room-1', sessionId = 'session-1', name = 'notes.txt' } = fields;
    const form = new FormData();
    form.append('roomId', roomId);
    form.append('sessionId', sessionId);
    form.append('file', body, name);
    return fetch(`${base}/files`, { method: 'POST', body: form });
  };

  const inRoom: Membership = (roomId, sessionId) =>
    roomId === 'room-1' && sessionId === 'session-1';

  afterEach(async () => {
    http.close();
    await once(http, 'close');
  });

  it('stores an accepted file and serves it back as a download', async () => {
    const store = new FileStore();
    await serve(store, inRoom);

    const response = await send(new Blob(['hello'], { type: 'text/plain' }));
    const attachment = (await response.json()) as FileAttachment;

    expect(response.status).toBe(201);
    expect(attachment).toMatchObject({ name: 'notes.txt', mimeType: 'text/plain', size: 5 });

    const download = await fetch(`${base}${attachment.url}`);
    expect(await download.text()).toBe('hello');
    expect(download.headers.get('content-disposition')).toBe('attachment; filename="notes.txt"');
    expect(download.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('refuses a sender who is no longer in the room', async () => {
    const store = new FileStore();
    await serve(store, inRoom);

    const response = await send(new Blob(['hello'], { type: 'text/plain' }), {
      sessionId: 'removed-session',
    });

    expect(response.status).toBe(403);
    expect(store.bytesInRoom('room-1')).toBe(0);
  });

  it('refuses a type that is not on the allow-list', async () => {
    const store = new FileStore();
    await serve(store, inRoom);

    const response = await send(new Blob(['#!/bin/sh'], { type: 'application/x-sh' }), {
      name: 'install.sh',
    });

    expect(response.status).toBe(415);
    expect(store.bytesInRoom('room-1')).toBe(0);
  });

  it('refuses a file over the cap without holding all of it', async () => {
    const store = new FileStore();
    await serve(store, inRoom);

    const response = await send(
      new Blob(['x'.repeat(MAX_FILE_BYTES + 1024)], { type: 'application/pdf' }),
      { name: 'huge.pdf' },
    );

    expect(response.status).toBe(413);
    expect(store.bytesInRoom('room-1')).toBe(0);
  });

  it('answers 429 once the sender has spent their allowance', async () => {
    const store = new FileStore();
    await serve(store, inRoom, new RateLimiter({ burst: 1, refillMs: 60_000 }));

    await send(new Blob(['one'], { type: 'text/plain' }));
    const response = await send(new Blob(['two'], { type: 'text/plain' }));

    expect(response.status).toBe(429);
    expect(store.bytesInRoom('room-1')).toBe(3);
  });

  it('answers 404 for a file the room no longer has', async () => {
    const store = new FileStore();
    await serve(store, inRoom);
    const attachment = (await (
      await send(new Blob(['hello'], { type: 'text/plain' }))
    ).json()) as FileAttachment;

    store.clearRoom('room-1');

    expect((await fetch(`${base}${attachment.url}`)).status).toBe(404);
  });
});
