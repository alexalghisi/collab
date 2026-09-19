import { beforeEach, describe, expect, it } from 'vitest';
import { requestGoogleCalendarToken } from './googleWeb';

const CLIENT_ID = 'collab.apps.googleusercontent.com';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

interface TokenResponse {
  readonly access_token?: string;
  readonly error?: string;
}

interface Asked {
  readonly scope: string;
  readonly prompt: string;
}

type GoogleGlobal = { google?: unknown };

function stubGoogle(response: TokenResponse): Asked[] {
  const asked: Asked[] = [];
  (globalThis as GoogleGlobal).google = {
    accounts: {
      id: {
        initialize: () => {},
        prompt: () => {},
      },
      oauth2: {
        initTokenClient: (config: { scope: string; callback: (value: TokenResponse) => void }) => ({
          requestAccessToken: (options?: { prompt?: string }) => {
            asked.push({ scope: config.scope, prompt: options?.prompt ?? '' });
            config.callback(response);
          },
        }),
      },
    },
  };
  return asked;
}

beforeEach(() => {
  delete (globalThis as GoogleGlobal).google;
  delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
});

describe('requestGoogleCalendarToken', () => {
  it('refuses to start when the deployment has no Google web client id', async () => {
    await expect(requestGoogleCalendarToken()).rejects.toThrow(
      'Google Calendar is not configured on this deployment.',
    );
  });

  it('asks Google for the calendar scope and hands back the access token', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const asked = stubGoogle({ access_token: 'ya29.calendar' });

    await expect(requestGoogleCalendarToken('consent')).resolves.toBe('ya29.calendar');
    expect(asked).toEqual([{ scope: CALENDAR_SCOPE, prompt: 'consent' }]);
  });

  it('reports a refused consent instead of resolving without a token', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    stubGoogle({ error: 'access_denied' });

    await expect(requestGoogleCalendarToken()).rejects.toThrow(
      'Google Calendar access was not granted.',
    );
  });
});
