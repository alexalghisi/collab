import { beforeEach, describe, expect, it } from 'vitest';
import { requestGoogleCalendarToken, requestGoogleCredential } from './googleWeb';

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

    await expect(requestGoogleCalendarToken()).resolves.toBe('ya29.calendar');
    expect(asked).toEqual([{ scope: CALENDAR_SCOPE, prompt: '' }]);
  });

  it('can still force the consent screen when the caller asks for it', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const asked = stubGoogle({ access_token: 'ya29.calendar' });

    await expect(requestGoogleCalendarToken('consent')).resolves.toBe('ya29.calendar');
    expect(asked).toEqual([{ scope: CALENDAR_SCOPE, prompt: 'consent' }]);
  });

  it('reports a refused consent instead of resolving without a token', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    stubGoogle({ error: 'access_denied' });

    await expect(requestGoogleCalendarToken()).rejects.toThrow(
      'Google Calendar access was not granted. If Google says the app is unverified, press Continue — this OAuth client is still in testing.',
    );
  });
});

describe('requestGoogleCredential', () => {
  it('refuses to start when the deployment has no Google web client id', async () => {
    await expect(requestGoogleCredential()).rejects.toThrow(
      'Google sign-in is not configured on this deployment.',
    );
  });

  it('opens the account picker once and returns an access token', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const asked = stubGoogle({ access_token: 'ya29.login' });

    const [first, second] = await Promise.all([
      requestGoogleCredential(),
      requestGoogleCredential(),
    ]);

    expect(first).toEqual({ accessToken: 'ya29.login' });
    expect(second).toEqual({ accessToken: 'ya29.login' });
    expect(asked).toEqual([{ scope: 'openid email profile', prompt: 'select_account' }]);
  });

  it('does not call Google One Tap initialize or prompt', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    let initializeCalls = 0;
    let promptCalls = 0;
    stubGoogle({ access_token: 'ya29.login' });
    const accounts = (globalThis as { google?: { accounts?: { id?: {
      initialize: () => void;
      prompt: () => void;
    } } } }).google?.accounts;
    if (accounts?.id) {
      accounts.id.initialize = () => {
        initializeCalls += 1;
      };
      accounts.id.prompt = () => {
        promptCalls += 1;
      };
    }

    await requestGoogleCredential();

    expect(initializeCalls).toBe(0);
    expect(promptCalls).toBe(0);
  });
});
