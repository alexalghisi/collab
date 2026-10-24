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

function stubWindow(open: (() => Window | null) | null): {
  fire(name: 'blur' | 'focus'): void;
} {
  const listeners = new Map<string, Array<() => void>>();
  vi.stubGlobal('window', {
    addEventListener: (name: string, listener: () => void) => {
      const list = listeners.get(name) ?? [];
      list.push(listener);
      listeners.set(name, list);
    },
    removeEventListener: (name: string, listener: () => void) => {
      const list = listeners.get(name) ?? [];
      listeners.set(
        name,
        list.filter((item) => item !== listener),
      );
    },
    open: open ?? (() => ({}) as Window),
  });
  return {
    fire: (name) => {
      for (const listener of listeners.get(name) ?? []) {
        listener();
      }
    },
  };
}

function stubGoogleThatOpens(open: () => void): void {
  (globalThis as GoogleGlobal).google = {
    accounts: {
      id: { initialize: () => undefined, prompt: () => undefined },
      oauth2: {
        initTokenClient: () => ({
          requestAccessToken: () => open(),
        }),
      },
    },
  };
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

  it('asks the Google token client for the calendar scope, with no redirect URI', async () => {
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

  it('says so when the browser blocks the Google window', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    stubWindow(() => null);
    stubGoogleThatOpens(() => {
      window.open('https://accounts.google.com/o/oauth2/v2/auth', 'google', 'popup');
    });

    await expect(requestGoogleCalendarToken()).rejects.toThrow(/blocked the Google window/);
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
    let errorCallback: unknown = 'unset';
    const stub = stubGoogle({ access_token: 'ya29.login' });
    const google = (globalThis as GoogleGlobal).google as {
      accounts: {
        oauth2: {
          initTokenClient: (config: { error_callback?: unknown }) => unknown;
        };
      };
    };
    const init = google.accounts.oauth2.initTokenClient;
    google.accounts.oauth2.initTokenClient = (config) => {
      errorCallback = config.error_callback;
      return init(config);
    };

    await expect(requestGoogleCredential()).resolves.toEqual({ accessToken: 'ya29.login' });
    expect(stub.asked).toEqual([{ scope: 'openid email profile', prompt: 'select_account' }]);
    expect(errorCallback).toBeUndefined();
  });

  it('opens the account picker in the same turn once Google is loaded', () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const stub = stubGoogle({ access_token: 'ya29.login' });

    const pending = requestGoogleCredential();

    expect(stub.asked).toEqual([{ scope: 'openid email profile', prompt: 'select_account' }]);
    return expect(pending).resolves.toEqual({ accessToken: 'ya29.login' });
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

  it('gives up when someone closes the Google window instead of waiting on it', async () => {
    vi.useFakeTimers();
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const browser = stubWindow(() => ({}) as Window);
    stubGoogleThatOpens(() => {
      window.open('https://accounts.google.com/o/oauth2/v2/auth', 'google', 'popup');
    });

    const pending = requestGoogleCredential();
    const settled = expect(pending).rejects.toThrow('Google sign-in was cancelled.');
    browser.fire('blur');
    browser.fire('focus');
    await vi.advanceTimersByTimeAsync(8_000);
    await settled;
    vi.useRealTimers();
  });

  it('says so when the browser blocks the Google window', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    stubWindow(() => null);
    stubGoogleThatOpens(() => {
      window.open('https://accounts.google.com/o/oauth2/v2/auth', 'google', 'popup');
    });

    await expect(requestGoogleCredential()).rejects.toThrow(
      'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
    );
  });

  it('passes on whatever Google says about a failure it has no name for', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    stubGoogle({ error: 'Network error' });

    await expect(requestGoogleCredential()).rejects.toThrow('Network error');
  });
});
