import { beforeEach, describe, expect, it, vi } from 'vitest';
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

interface GoogleStub {
  readonly asked: Asked[];
  initializeCalls: number;
  promptCalls: number;
}

type GoogleGlobal = { google?: unknown };

function stubGoogle(response: TokenResponse): GoogleStub {
  const stub: GoogleStub = { asked: [], initializeCalls: 0, promptCalls: 0 };
  (globalThis as GoogleGlobal).google = {
    accounts: {
      id: {
        initialize: () => {
          stub.initializeCalls += 1;
        },
        prompt: () => {
          stub.promptCalls += 1;
          throw new Error('GIS One Tap prompt should not run');
        },
      },
      oauth2: {
        initTokenClient: (config: { scope: string; callback: (value: TokenResponse) => void }) => ({
          requestAccessToken: (options?: { prompt?: string }) => {
            stub.asked.push({ scope: config.scope, prompt: options?.prompt ?? '' });
            config.callback(response);
          },
        }),
      },
    },
  };
  return stub;
}

beforeEach(() => {
  delete (globalThis as GoogleGlobal).google;
  delete (globalThis as { electronAuth?: unknown }).electronAuth;
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
    const stub = stubGoogle({ access_token: 'ya29.calendar' });

    await expect(requestGoogleCalendarToken('consent')).resolves.toBe('ya29.calendar');
    expect(stub.asked).toEqual([{ scope: CALENDAR_SCOPE, prompt: 'consent' }]);
  });

  it('delegates to electronAuth.requestCalendarToken when running in Electron', async () => {
    const requestCalendarTokenStub = vi.fn().mockResolvedValue('ya29.electron-calendar');
    (globalThis as { electronAuth?: unknown }).electronAuth = {
      isElectron: true,
      clientId: 'electron-client-id',
      requestCalendarToken: requestCalendarTokenStub,
    };

    await expect(requestGoogleCalendarToken('consent')).resolves.toBe('ya29.electron-calendar');
    expect(requestCalendarTokenStub).toHaveBeenCalledWith('electron-client-id', 'consent');
  });

  it('reports a refused consent instead of resolving without a token', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    stubGoogle({ error: 'access_denied' });

    await expect(requestGoogleCalendarToken()).rejects.toThrow(
      'Google Calendar access was not granted.',
    );
  });
});

describe('requestGoogleCredential', () => {
  it('refuses to start when the deployment has no Google web client id', async () => {
    await expect(requestGoogleCredential()).rejects.toThrow(
      'Google sign-in is not configured on this deployment.',
    );
  });

  it('opens the OAuth account picker and returns an access token', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const stub = stubGoogle({ access_token: 'ya29.login' });

    await expect(requestGoogleCredential()).resolves.toEqual({ accessToken: 'ya29.login' });
    expect(stub.asked).toEqual([{ scope: 'openid email profile', prompt: 'select_account' }]);
  });

  it('delegates to electronAuth.loginWithGoogle when running in Electron', async () => {
    const loginWithGoogle = vi.fn().mockResolvedValue({
      idToken: 'mock-id-token',
      accessToken: 'mock-access-token',
    });
    (globalThis as { electronAuth?: unknown }).electronAuth = {
      isElectron: true,
      clientId: 'electron-client-id',
      loginWithGoogle,
    };

    await expect(requestGoogleCredential()).resolves.toEqual({
      idToken: 'mock-id-token',
      accessToken: 'mock-access-token',
    });
    expect(loginWithGoogle).toHaveBeenCalledWith('electron-client-id');
  });

  it('does not call Google One Tap initialize or prompt', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const stub = stubGoogle({ access_token: 'ya29.login' });

    await requestGoogleCredential();

    expect(stub.initializeCalls).toBe(0);
    expect(stub.promptCalls).toBe(0);
  });

  it('surfaces popup_closed_by_user from the token client', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    stubGoogle({ error: 'popup_closed_by_user' });

    await expect(requestGoogleCredential()).rejects.toThrow('popup_closed_by_user');
  });
});
