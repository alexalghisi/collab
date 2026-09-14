import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthSession } from '../../../src/auth/types';
import type { Meeting } from '../../../src/meeting/types';
import { AccountStore, type AccountsFile } from '../accounts/AccountStore';
import { accountsRouter } from '../accounts/router';
import { JsonFile } from '../db/JsonFile';
import { MeetingStore, type MeetingsFile } from './MeetingStore';
import { meetingsRouter } from './router';

describe('the meetings endpoint', () => {
  let http: Server;
  let base: string;

  const draft = {
    title: 'Weekly sync',
    roomId: 'quiet-otter-42',
    startsAt: 1_900_000_000_000,
    durationMinutes: 30,
    description: '',
    attendeeIds: [] as string[],
  };

  const signUp = async (displayName: string, email: string): Promise<AuthSession> => {
    const response = await fetch(`${base}/accounts/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, email, password: 'meeting-room-1' }),
    });
    return (await response.json()) as AuthSession;
  };

  const list = async (token: string): Promise<Meeting[]> => {
    const response = await fetch(`${base}/meetings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return ((await response.json()) as { meetings: Meeting[] }).meetings;
  };

  const schedule = (token: string, body: unknown) =>
    fetch(`${base}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  const cancel = (token: string, id: string) =>
    fetch(`${base}/meetings/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

  beforeEach(async () => {
    const accounts = new AccountStore(
      new JsonFile<AccountsFile>(null, { accounts: [], sessions: [] }),
    );
    const meetings = new MeetingStore(accounts, new JsonFile<MeetingsFile>(null, { meetings: [] }));
    const app = express();
    app.use(express.json());
    app.use(accountsRouter({ store: accounts }));
    app.use(meetingsRouter({ accounts, meetings }));
    http = app.listen(0);
    await once(http, 'listening');
    base = `http://localhost:${(http.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    http.close();
    await once(http, 'close');
  });

  it('puts a scheduled meeting on the calendar of everyone invited', async () => {
    const ada = await signUp('Ada Lovelace', 'ada@example.com');
    const linus = await signUp('Linus', 'linus@example.com');

    const created = await schedule(ada.token, { ...draft, attendeeIds: [linus.account.id] });

    expect(created.status).toBe(201);
    expect((await list(linus.token))[0]).toMatchObject({
      title: 'Weekly sync',
      organizer: { displayName: 'Ada Lovelace' },
      attendees: [{ displayName: 'Linus' }],
    });
  });

  it('keeps a meeting off the calendar of somebody who was not invited', async () => {
    const ada = await signUp('Ada Lovelace', 'ada@example.com');
    const grace = await signUp('Grace Hopper', 'grace@example.com');

    await schedule(ada.token, draft);

    expect(await list(grace.token)).toEqual([]);
  });

  it('refuses a meeting without a title', async () => {
    const ada = await signUp('Ada Lovelace', 'ada@example.com');

    const response = await schedule(ada.token, { ...draft, title: '   ' });

    expect(response.status).toBe(400);
  });

  it('lets the organiser cancel for everybody, and refuses a guest', async () => {
    const ada = await signUp('Ada Lovelace', 'ada@example.com');
    const linus = await signUp('Linus', 'linus@example.com');
    await schedule(ada.token, { ...draft, attendeeIds: [linus.account.id] });
    const [meeting] = await list(ada.token);

    expect((await cancel(linus.token, meeting.id)).status).toBe(403);
    expect((await cancel(ada.token, meeting.id)).status).toBe(204);
    expect(await list(linus.token)).toEqual([]);
    expect((await cancel(ada.token, meeting.id)).status).toBe(404);
  });

  it('turns away a caller with no session', async () => {
    const anonymous = await fetch(`${base}/meetings`);

    expect(anonymous.status).toBe(401);
  });
});
