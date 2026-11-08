import { readSessionToken } from '../auth/session';
import { timeoutSignal } from '../net/timeoutSignal';
import { SIGNALING_URL } from '../signaling/config';

/**
 * Client side of the server's permanent Google Calendar access (server/src/calendar).
 * The refresh token never reaches the browser in the clear: the server hands out access
 * tokens plus a sealed grant that only the server can open.
 */

export interface CalendarAccess {
  readonly accessToken: string;
  /** Epoch ms after which the access token should be renewed. */
  readonly expiresAt: number;
  /** Sealed copy of the permanent grant, for the browser to keep. */
  readonly grant: string | null;
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

function toAccess(body: {
  accessToken?: unknown;
  expiresIn?: unknown;
  grant?: unknown;
}): CalendarAccess {
  if (typeof body.accessToken !== 'string' || !body.accessToken) {
    throw new Error('Google Calendar returned an unexpected answer.');
  }
  const seconds = typeof body.expiresIn === 'number' && body.expiresIn > 0 ? body.expiresIn : 3600;
  // Renew a minute early so a sync never starts with a token about to expire.
  return {
    accessToken: body.accessToken,
    expiresAt: Date.now() + (seconds - 60) * 1000,
    grant: typeof body.grant === 'string' ? body.grant : null,
  };
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

export interface CalendarServerStatus {
  readonly configured: boolean;
  readonly connected: boolean;
}

/**
 * Whether the server can keep Google Calendar connected for good (client secret set).
 * null means unknown (server down or waking up), which is not the same as "not configured".
 */
export async function calendarServerStatus(): Promise<CalendarServerStatus | null> {
  try {
    const response = await fetch(`${SIGNALING_URL}/calendar/status`, {
      headers: headers(),
      signal: timeoutSignal(45_000),
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { configured?: unknown; connected?: unknown };
    return { configured: body.configured === true, connected: body.connected === true };
  } catch {
    return null;
  }
}

export async function connectCalendarOnServer(
  code: string,
  redirectUri: string,
): Promise<CalendarAccess> {
  return toAccess(await post('/calendar/connect', { code, redirectUri }));
}

/** A fresh access token minted from the stored refresh token — no click, no popup. */
export async function refreshCalendarOnServer(grant: string | null): Promise<CalendarAccess> {
  return toAccess(await post('/calendar/token', grant ? { grant } : {}));
}

export async function disconnectCalendarOnServer(grant: string | null): Promise<void> {
  await post('/calendar/disconnect', grant ? { grant } : {}).catch(() => undefined);
}
