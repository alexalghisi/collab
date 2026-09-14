import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RateLimiter } from '../execution/RateLimiter';
import { AccountStore, memoryDatabase } from './AccountStore';
import { accountRouter } from './router';

describe('the account endpoints', () => {
  let http: Server;
  let base: string;
  let store: AccountStore;

  const serve = async (limiter?: RateLimiter) => {
    store = new AccountStore(memoryDatabase());
    const app = express();
    app.use(express.json());
    app.use(accountRouter({ store, limiter }));
    http = app.listen(0);
    await once(http, 'listening');
    base = `http://localhost:${(http.address() as AddressInfo).port}`;
  };

  const post = (path: string, body: Record<string, string>, token?: string) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  const get = (path: string, token?: string) =>
    fetch(`${base}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  const signUp = async (name: string, email: string) => {
    const response = await post('/auth/signup', { name, email, password: 'analytical-engine' });
    return (await response.json()) as { token: string; account: { id: string; name: string } };
  };

  beforeEach(async () => {
    await serve();
  });

  afterEach(async () => {
    http.close();
    await once(http, 'close');
  });

  it('creates an account and answers with a usable token', async () => {
    const response = await post('/auth/signup', {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'analytical-engine',
    });
    const body = (await response.json()) as { token: string; account: { name: string } };

    expect(response.status).toBe(201);
    expect(body.account.name).toBe('Ada Lovelace');
    const me = await get('/auth/me', body.token);
    expect(await me.json()).toEqual({ account: expect.objectContaining({ name: 'Ada Lovelace' }) });
  });

  it('reports the address that is already taken', async () => {
    await signUp('Ada Lovelace', 'ada@example.com');

    const response = await post('/auth/signup', {
      name: 'Ada Again',
      email: 'ada@example.com',
      password: 'analytical-engine',
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'That email address already has an account.' });
  });

  it('signs an existing account in and refuses a wrong password', async () => {
    await signUp('Ada Lovelace', 'ada@example.com');

    const ok = await post('/auth/login', {
      email: 'ada@example.com',
      password: 'analytical-engine',
    });
    const bad = await post('/auth/login', { email: 'ada@example.com', password: 'guess' });

    expect(ok.status).toBe(200);
    expect(bad.status).toBe(401);
  });

  it('keeps the directory and the profile behind the token', async () => {
    const { token } = await signUp('Ada Lovelace', 'ada@example.com');
    await signUp('Linus', 'linus@example.com');

    const anonymous = await get('/auth/directory');
    const signedIn = await get('/auth/directory', token);
    const body = (await signedIn.json()) as { people: Array<{ name: string }> };

    expect(anonymous.status).toBe(401);
    expect(body.people.map((person) => person.name)).toEqual(['Ada Lovelace', 'Linus']);
  });

  it('never puts a password verifier in the directory', async () => {
    const { token } = await signUp('Ada Lovelace', 'ada@example.com');

    const body = await (await get('/auth/directory', token)).text();

    expect(body).not.toMatch(/password/i);
  });

  it('stops honouring a token after it is signed out', async () => {
    const { token } = await signUp('Ada Lovelace', 'ada@example.com');

    expect((await post('/auth/logout', {}, token)).status).toBe(200);
    expect((await get('/auth/me', token)).status).toBe(401);
  });

  it('answers 429 once the attempts have been spent', async () => {
    http.close();
    await once(http, 'close');
    await serve(new RateLimiter({ burst: 1, refillMs: 60_000 }));
    await signUp('Ada Lovelace', 'ada@example.com');
    const login = () =>
      post('/auth/login', { email: 'ada@example.com', password: 'analytical-engine' });

    expect((await login()).status).toBe(200);
    expect((await login()).status).toBe(429);
  });
});
