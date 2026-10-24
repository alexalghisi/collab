import { readSessionToken } from '../auth/session';
import { timeoutSignal } from '../net/timeoutSignal';
import { SIGNALING_URL } from '../signaling/config';

/**
 * Client side of the server's permanent Google Calendar access (server/src/calendar).
 * The refresh token never reaches the browser; the server hands out access tokens.
 */

export interface CalendarAccess {
  readonly accessToken: string;
  /** Epoch ms after which the access token should be renewed. */
  readonly expiresAt: number;
}

export const CALENDAR_NOT_CONNECTED = 'not_connected';
export const CALENDAR_NOT_CONFIGURED = 'not_configured';

function headers(): Record<string, string> {
  const token = readSessionToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function toAccess(body: { accessToken?: unknown; expiresIn?: unknown }): CalendarAccess {
  if (typeof body.accessToken !== 'string' || !body.accessToken) {
    throw new Error('Google Calendar returned an unexpected answer.');
  }
  const seconds = typeof body.expiresIn === 'number' && body.expiresIn > 0 ? body.expiresIn : 3600;
  // Renew a minute early so a sync never starts with a token about to expire.
  return { accessToken: body.accessToken, expiresAt: Date.now() + (seconds - 60) * 1000 };
}

async function post(path: string, body: unknown = {}): Promise<Record<string, unknown>> {
  const response = await fetch(`${SIGNALING_URL}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal: timeoutSignal(45_000),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof json.error === 'string' ? json.error : 'Google Calendar sync failed.');
  }
  return json;
}

/** Whether the server can keep Google Calendar connected for good (client secret set). */
export async function calendarServerStatus(): Promise<{ configured: boolean; connected: boolean }> {
  try {
    const response = await fetch(`${SIGNALING_URL}/calendar/status`, {
      headers: headers(),
      signal: timeoutSignal(45_000),
    });
    if (!response.ok) {
      return { configured: false, connected: false };
    }
    const body = (await response.json()) as { configured?: unknown; connected?: unknown };
    return { configured: body.configured === true, connected: body.connected === true };
  } catch {
    return { configured: false, connected: false };
  }
}

export async function connectCalendarOnServer(
  code: string,
  redirectUri: string,
): Promise<CalendarAccess> {
  return toAccess(await post('/calendar/connect', { code, redirectUri }));
}

/** A fresh access token minted from the stored refresh token — no click, no popup. */
export async function refreshCalendarOnServer(): Promise<CalendarAccess> {
  return toAccess(await post('/calendar/token'));
}

export async function disconnectCalendarOnServer(): Promise<void> {
  await post('/calendar/disconnect').catch(() => undefined);
}
