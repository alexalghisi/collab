import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { UserStore } from '../auth/store';
import { issueToken } from '../auth/tokens';
import { calendarRouter, isAllowedRedirect, type TokenRequest } from './router';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function start(requestToken: TokenRequest, configured = true) {
  const dir = mkdtempSync(join(tmpdir(), 'collab-calendar-'));
  dirs.push(dir);
  const store = new UserStore(join(dir, 'users.json'));
  const user = store.create({ email: 'ana@example.com', displayName: 'Ana', passwordHash: null });
  const revoked: string[] = [];
  const app = express();
  app.use(express.json());
  app.use(
    calendarRouter({
      store,
      config: configured ? { clientId: 'id', clientSecret: 'secret' } : null,
      requestToken,
      revoke: async (token) => {
        revoked.push(token);
      },
    }),
  );
  const server = createServer(app);
  server.listen(0);
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const auth = {
    Authorization: `Bearer ${issueToken({ uid: user.uid, email: user.email, displayName: 'Ana' })}`,
    'Content-Type': 'application/json',
  };
  const post = (path: string, body: unknown = {}) =>
    fetch(`${url}${path}`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
  return {
    store,
    user,
    revoked,
    post,
    url,
    auth,
    close: () => new Promise((r) => server.close(r)),
  };
}

describe('calendar router', () => {
  it('keeps the refresh token after one consent and mints access tokens from it later', async () => {
    const calls: Record<string, string>[] = [];
    const app = await start(async (params) => {
      calls.push(params);
      return params.grant_type === 'authorization_code'
        ? { status: 200, body: { access_token: 'a1', expires_in: 3599, refresh_token: 'r1' } }
        : { status: 200, body: { access_token: 'a2', expires_in: 3599 } };
    });
    const connect = await app.post('/calendar/connect', {
      code: 'c',
      redirectUri: 'https://collab.example/',
    });
    expect(await connect.json()).toEqual({ accessToken: 'a1', expiresIn: 3599 });
    expect(app.store.calendarRefreshToken(app.user.uid)).toBe('r1');

    const refreshed = await app.post('/calendar/token');
    expect(await refreshed.json()).toEqual({ accessToken: 'a2', expiresIn: 3599 });
    expect(calls[1]).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'r1' });

    const status = await fetch(`${app.url}/calendar/status`, { headers: app.auth });
    expect(await status.json()).toEqual({ configured: true, connected: true });
    await app.close();
  });

  it('forgets a revoked grant so the person can connect again', async () => {
    const app = await start(async () => ({ status: 400, body: { error: 'invalid_grant' } }));
    app.store.setCalendarRefreshToken(app.user.uid, 'old');
    const response = await app.post('/calendar/token');
    expect(response.status).toBe(404);
    expect(app.store.calendarRefreshToken(app.user.uid)).toBeNull();
    await app.close();
  });

  it('refuses requests without a session and reports a missing secret', async () => {
    const app = await start(async () => ({ status: 200, body: {} }), false);
    const anonymous = await fetch(`${app.url}/calendar/token`, { method: 'POST' });
    expect(anonymous.status).toBe(401);
    expect((await app.post('/calendar/token')).status).toBe(503);
    await app.close();
  });

  it('revokes and clears the grant on disconnect', async () => {
    const app = await start(async () => ({ status: 200, body: {} }));
    app.store.setCalendarRefreshToken(app.user.uid, 'r9');
    await app.post('/calendar/disconnect');
    expect(app.revoked).toEqual(['r9']);
    expect(app.store.calendarRefreshToken(app.user.uid)).toBeNull();
    await app.close();
  });

  it('only redeems codes for https or local redirect pages', () => {
    expect(isAllowedRedirect('https://alexalghisi.github.io/collab/')).toBe(true);
    expect(isAllowedRedirect('http://localhost:8081/')).toBe(true);
    expect(isAllowedRedirect('postmessage')).toBe(true);
    expect(isAllowedRedirect('javascript:alert(1)')).toBe(false);
  });
});
