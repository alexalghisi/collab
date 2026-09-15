import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { authRouter } from './router';
import { UserStore } from './store';

async function start(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use(authRouter({ store: new UserStore(join(dir, 'users.json')) }));
  const server = createServer(app);
  server.listen(0);
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

describe('auth router', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates an account, restores the session, and rejects a duplicate email', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'collab-auth-'));
    dirs.push(dir);
    const { url, close } = await start(dir);
    try {
      const created = await fetch(`${url}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'Ada@example.com',
          password: 'password1',
          displayName: 'Ada Lovelace',
        }),
      });
      expect(created.status).toBe(201);
      const body = (await created.json()) as { token: string; user: { email: string } };
      expect(body.user.email).toBe('ada@example.com');

      const me = await fetch(`${url}/auth/me`, {
        headers: { Authorization: `Bearer ${body.token}` },
      });
      expect(me.status).toBe(200);

      const duplicate = await fetch(`${url}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'ada@example.com',
          password: 'password1',
          displayName: 'Ada',
        }),
      });
      expect(duplicate.status).toBe(409);
    } finally {
      await close();
    }
  });

  it('signs an existing account in and rejects a bad password', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'collab-auth-'));
    dirs.push(dir);
    const { url, close } = await start(dir);
    try {
      await fetch(`${url}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'linus@example.com',
          password: 'password1',
          displayName: 'Linus',
        }),
      });
      const ok = await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'linus@example.com', password: 'password1' }),
      });
      expect(ok.status).toBe(200);
      const bad = await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'linus@example.com', password: 'nope-nope' }),
      });
      expect(bad.status).toBe(401);
    } finally {
      await close();
    }
  });
});
