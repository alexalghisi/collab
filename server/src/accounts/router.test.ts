import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthSession } from '../../../src/auth/types';
import { RateLimiter } from '../execution/RateLimiter';
import { JsonFile } from '../db/JsonFile';
import { AccountStore, type AccountsFile } from './AccountStore';
import { accountsRouter } from './router';

describe('the accounts endpoint', () => {
  let http: Server;
  let base: string;
  let store: AccountStore;

  const serve = async (limiter?: RateLimiter) => {
    store = new AccountStore(new JsonFile<AccountsFile>(null, { accounts: [], sessions: [] }));
    const app = express();
    app.use(express.json());
    app.use(accountsRouter({ store, limiter }));
    http = app.listen(0);
    await once(http, 'listening');
    base = `http://localhost:${(http.address() as AddressInfo).port}`;
  };

  const post = (path: string, body?: unknown, token?: string) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });

  const get = (path: string, token?: string) =>
    fetch(`${base}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  const signUp = async (displayName: string, email: string): Promise<AuthSession> => {
    const response = await post('/accounts/signup', {
      displayName,
      email,
      password: 'meeting-room-1',
    });
    return (await response.json()) as AuthSession;
  };

  beforeEach(async () => {
    await serve();
  });

  afterEach(async () => {
    http.close();
    await once(http, 'close');
  });

  it('signs somebody up and then signs them back in', async () => {
    const created = await signUp('Ada Lovelace', 'ada@example.com');
    expect(created.account.displayName).toBe('Ada Lovelace');

    const again = await post('/accounts/login', {
      email: 'ada@example.com',
      password: 'meeting-room-1',
    });
    const session = (await again.json()) as AuthSession;

    expect(again.status).toBe(200);
    expect(session.account.id).toBe(created.account.id);
    expect(session.token).not.toBe(created.token);
  });

  it('answers 409 when the email is taken and 401 on a wrong password', async () => {
    await signUp('Ada Lovelace', 'ada@example.com');

    const taken = await post('/accounts/signup', {
      displayName: 'Impostor',
      email: 'ada@example.com',
      password: 'meeting-room-1',
    });
    const wrong = await post('/accounts/login', {
      email: 'ada@example.com',
      password: 'wrong-one-here',
    });

    expect(taken.status).toBe(409);
    expect(wrong.status).toBe(401);
    expect(((await wrong.json()) as { error: string }).error).toMatch(/wrong email or password/i);
  });

  it('explains what is wrong with a rejected sign-up', async () => {
    const response = await post('/accounts/signup', {
      displayName: 'Ada',
      email: 'ada@example.com',
      password: 'short',
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as { reason: string }).toMatchObject({
      reason: 'password-short',
    });
  });

  it('hands the directory to a signed-in caller only', async () => {
    const ada = await signUp('Ada Lovelace', 'ada@example.com');
    await signUp('Linus', 'linus@example.com');

    const anonymous = await get('/accounts');
    const listed = await get('/accounts', ada.token);
    const directory = (await listed.json()) as { accounts: { displayName: string }[] };

    expect(anonymous.status).toBe(401);
    expect(directory.accounts.map((account) => account.displayName)).toEqual([
      'Ada Lovelace',
      'Linus',
    ]);
  });

  it('resolves and then forgets the caller behind a token', async () => {
    const ada = await signUp('Ada Lovelace', 'ada@example.com');

    const me = await get('/accounts/me', ada.token);
    expect(((await me.json()) as { account: { email: string } }).account.email).toBe(
      'ada@example.com',
    );

    expect((await post('/accounts/logout', {}, ada.token)).status).toBe(204);
    expect((await get('/accounts/me', ada.token)).status).toBe(401);
  });

  it('stops a burst of guesses at the door', async () => {
    await serve(new RateLimiter({ burst: 2, refillMs: 60_000 }));
    await signUp('Ada Lovelace', 'ada@example.com');

    const second = await post('/accounts/login', {
      email: 'ada@example.com',
      password: 'nope1234',
    });
    const third = await post('/accounts/login', { email: 'ada@example.com', password: 'nope1234' });

    expect(second.status).toBe(401);
    expect(third.status).toBe(429);
  });
});
