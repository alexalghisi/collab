import { Router, type Request } from 'express';
import { verifyToken } from '../auth/tokens';
import type { UserStore } from '../auth/store';

/**
 * Permanent Google Calendar access. The browser only ever gets short-lived
 * access tokens (one hour); without a refresh token every hour ends with
 * "connect again". Here the one-time consent is exchanged for a refresh token
 * that stays on the server, sealed in the account store, and any later
 * access token is minted from it silently — connect once, synced for good.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export interface GoogleOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface GoogleTokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
  readonly refresh_token?: string;
  readonly scope?: string;
  readonly error?: string;
}

export type TokenRequest = (params: Record<string, string>) => Promise<{
  readonly status: number;
  readonly body: GoogleTokenResponse;
}>;

export interface CalendarRouterOptions {
  readonly store: UserStore;
  readonly config?: GoogleOAuthConfig | null;
  readonly requestToken?: TokenRequest;
  readonly revoke?: (token: string) => Promise<void>;
}

export function oauthConfigFromEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): GoogleOAuthConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

const defaultRequestToken: TokenRequest = async (params) => {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const body = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
  return { status: response.status, body };
};

const defaultRevoke = async (token: string): Promise<void> => {
  await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(
    () => undefined,
  );
};

function sessionUid(request: Request): string | null {
  const header = request.headers.authorization;
  const token =
    typeof header === 'string' && header.toLowerCase().startsWith('bearer ') ? header.slice(7) : '';
  return verifyToken(token)?.uid ?? null;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Only redirect URIs of this app's own pages may be used to redeem a code. */
export function isAllowedRedirect(uri: string): boolean {
  // GIS code client (popup): Google requires redirect_uri=postmessage when redeeming the code.
  if (uri === 'postmessage') {
    return true;
  }
  try {
    const url = new URL(uri);
    return (
      url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

export function calendarRouter({
  store,
  config = oauthConfigFromEnv(),
  requestToken = defaultRequestToken,
  revoke = defaultRevoke,
}: CalendarRouterOptions): Router {
  const router = Router();

  router.get('/calendar/status', (request, response) => {
    const uid = sessionUid(request);
    response.json({
      configured: Boolean(config),
      connected: Boolean(uid && store.calendarRefreshToken(uid)),
    });
  });

  router.post('/calendar/connect', async (request, response) => {
    const uid = sessionUid(request);
    if (!uid) {
      response.status(401).json({ error: 'Sign in again to connect Google Calendar.' });
      return;
    }
    if (!config) {
      response.status(503).json({ error: 'not_configured' });
      return;
    }
    const code = readString(request.body?.code);
    const redirectUri = readString(request.body?.redirectUri);
    if (!code || !isAllowedRedirect(redirectUri)) {
      response.status(400).json({ error: 'Google did not return a valid authorization.' });
      return;
    }
    const { status, body } = await requestToken({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
    });
    if (status !== 200 || !body.access_token) {
      response
        .status(400)
        .json({ error: 'Google refused this authorization. Try connecting again.' });
      return;
    }
    if (body.scope && !body.scope.split(' ').includes(CALENDAR_SCOPE)) {
      response.status(400).json({ error: 'Google Calendar access was not granted.' });
      return;
    }
    // Google sends a refresh token only with fresh consent; keep the old one otherwise.
    const refresh = body.refresh_token ?? store.calendarRefreshToken(uid);
    if (!refresh) {
      response
        .status(400)
        .json({ error: 'Google did not grant offline access. Try connecting again.' });
      return;
    }
    store.setCalendarRefreshToken(uid, refresh);
    response.json({ accessToken: body.access_token, expiresIn: body.expires_in ?? 3600 });
  });

  router.post('/calendar/token', async (request, response) => {
    const uid = sessionUid(request);
    if (!uid) {
      response.status(401).json({ error: 'Sign in again to sync Google Calendar.' });
      return;
    }
    if (!config) {
      response.status(503).json({ error: 'not_configured' });
      return;
    }
    const refresh = store.calendarRefreshToken(uid);
    if (!refresh) {
      response.status(404).json({ error: 'not_connected' });
      return;
    }
    const { status, body } = await requestToken({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    if (status === 200 && body.access_token) {
      response.json({ accessToken: body.access_token, expiresIn: body.expires_in ?? 3600 });
      return;
    }
    if (body.error === 'invalid_grant') {
      // Access was revoked in the Google account: forget it, the person connects again.
      store.setCalendarRefreshToken(uid, null);
      response.status(404).json({ error: 'not_connected' });
      return;
    }
    response.status(502).json({ error: 'Google Calendar did not answer. Retrying shortly.' });
  });

  router.post('/calendar/disconnect', async (request, response) => {
    const uid = sessionUid(request);
    if (!uid) {
      response.status(401).json({ error: 'Sign in again.' });
      return;
    }
    const refresh = store.calendarRefreshToken(uid);
    store.setCalendarRefreshToken(uid, null);
    if (refresh) {
      await revoke(refresh);
    }
    response.json({ ok: true });
  });

  return router;
}
