import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../execution/RateLimiter';
import { issueToken } from '../auth/tokens';
import { ReminderBook } from './reminders';
import { inviteRouter, type Membership } from './router';
import type { InviteTransport } from './senders';

describe('the invite endpoint', () => {
  let http: Server;
  let base: string;

  const inRoom: Membership = (roomId, sessionId) =>
    roomId === 'room-1' && sessionId === 'session-1';

  const serve = async (
    transport: InviteTransport,
    limiter?: RateLimiter,
    publicAppUrl?: string,
    reminders?: ReminderBook,
  ) => {
    const app = express();
    app.use(express.json());
    app.use(inviteRouter({ membership: inRoom, transport, limiter, publicAppUrl, reminders }));
    http = app.listen(0);
    await once(http, 'listening');
    base = `http://localhost:${(http.address() as AddressInfo).port}`;
  };

  const send = (body: Record<string, string>) =>
    fetch(`${base}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: 'room-1',
        sessionId: 'session-1',
        hostName: 'Ada',
        link: 'http://localhost:8082/?room=room-1',
        ...body,
      }),
    });

  afterEach(async () => {
    http.close();
    await once(http, 'close');
  });

  it('sends an SMS with a public join link', async () => {
    const sendSms = vi.fn(async () => undefined);
    await serve(
      { sendSms, sendEmail: vi.fn(async () => undefined) },
      undefined,
      'https://collab.example',
    );

    const response = await send({ contact: '+40 721 123 456' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, kind: 'phone', to: '+40721123456' });
    expect(sendSms).toHaveBeenCalledWith(
      '+40721123456',
      'Ada invited you to a Collab call. Join: https://collab.example/?room=room-1',
    );
  });

  it('sends an email when the contact is an address', async () => {
    const sendEmail = vi.fn(async () => undefined);
    await serve({ sendSms: vi.fn(async () => undefined), sendEmail });

    const response = await send({
      contact: 'ada@example.com',
      link: 'https://collab.example/?room=room-1',
    });

    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(
      'ada@example.com',
      'Join my Collab meeting (room-1)',
      expect.stringContaining('https://collab.example/?room=room-1'),
    );
  });

  it('refuses a sender who is no longer in the room', async () => {
    const sendSms = vi.fn(async () => undefined);
    await serve({ sendSms, sendEmail: vi.fn(async () => undefined) });

    const response = await send({ contact: '+40721123456', sessionId: 'removed' });

    expect(response.status).toBe(403);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('answers 429 once the sender has spent their allowance', async () => {
    const sendSms = vi.fn(async () => undefined);
    await serve(
      { sendSms, sendEmail: vi.fn(async () => undefined) },
      new RateLimiter({ burst: 1, refillMs: 60_000 }),
    );

    expect((await send({ contact: '+40721123456' })).status).toBe(200);
    expect((await send({ contact: '+40721123456' })).status).toBe(429);
    expect(sendSms).toHaveBeenCalledTimes(1);
  });

  it('lets a signed-in host mail everyone from the calendar and queue a reminder', async () => {
    const sendEmail = vi.fn(async () => undefined);
    const dir = mkdtempSync(join(tmpdir(), 'collab-invite-'));
    const reminders = new ReminderBook(join(dir, 'reminders.json'), () => 1_000);
    await serve({ sendSms: vi.fn(async () => undefined), sendEmail }, undefined, undefined, reminders);
    const token = issueToken({ uid: 'ada', email: 'ada@example.com', displayName: 'Ada' });

    const response = await fetch(`${base}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        contact: 'linus@example.com, tom@example.com',
        roomId: 'room-9',
        sessionId: '',
        hostName: 'Ada',
        link: 'https://collab.example/?room=room-9',
        title: 'Standup',
        startsAt: 1_000 + 20 * 60_000,
        reminderMinutes: 15,
      }),
    });

    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(reminders.list()).toHaveLength(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it('surfaces a provider failure', async () => {
    await serve({
      sendSms: async () => {
        throw new Error('The SMS could not be delivered.');
      },
      sendEmail: vi.fn(async () => undefined),
    });

    const response = await send({ contact: '+40721123456' });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'The SMS could not be delivered.' });
  });
});
