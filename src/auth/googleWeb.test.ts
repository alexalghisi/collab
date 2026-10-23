import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestGoogleCalendarToken, requestGoogleCredential } from './googleWeb';

const CLIENT_ID = 'collab.apps.googleusercontent.com';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const SIGN_IN_SCOPE = 'openid email profile';

type GoogleGlobal = { google?: unknown };

interface RedirectFields {
  readonly access_token?: string;
  readonly error?: string;
  readonly state: string;
}

interface BrowserStub {
  readonly opened: URL[];
  restore(): void;
}

/** Fakes the browser: window.open "redirects" back by broadcasting the result. */
function stubBrowser(
  respond: ((request: { state: string }) => RedirectFields) | null,
): BrowserStub {
  const opened: URL[] = [];
  const g = globalThis as { window?: unknown };
  const previous = g.window;
  g.window = {
    location: { origin: 'https://alexalghisi.github.io', pathname: '/collab/', hash: '' },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    open: (href: string) => {
      if (!respond) {
        return null;
      }
      const url = new URL(href);
      opened.push(url);
      const fields = respond({ state: url.searchParams.get('state') ?? '' });
      const channel = new BroadcastChannel('collab.google-oauth');
      channel.postMessage({
        state: fields.state,
        accessToken: fields.access_token,
        error: fields.error,
      });
      channel.close();
      return {};
    },
  };
  return {
    opened,
    restore: () => {
      g.window = previous;
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

  it('asks Google for the calendar scope in its own popup and hands back the token', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const browser = stubBrowser((url) => ({ access_token: 'ya29.calendar', state: url.state }));

    await expect(requestGoogleCalendarToken('consent')).resolves.toBe('ya29.calendar');
    expect(browser.opened).toHaveLength(1);
    expect(browser.opened[0]?.searchParams.get('scope')).toBe(CALENDAR_SCOPE);
    expect(browser.opened[0]?.searchParams.get('prompt')).toBe('consent');
    expect(browser.opened[0]?.searchParams.get('redirect_uri')).toBe(
      'https://alexalghisi.github.io/collab/',
    );
    browser.restore();
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
    const browser = stubBrowser((url) => ({ error: 'access_denied', state: url.state }));

    await expect(requestGoogleCalendarToken()).rejects.toThrow(
      'Google Calendar access was not granted.',
    );
    browser.restore();
  });

  it('says so when the browser blocks the Google window', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const browser = stubBrowser(null);

    await expect(requestGoogleCalendarToken()).rejects.toThrow(/blocked the Google window/);
    browser.restore();
  });
});

describe('requestGoogleCredential', () => {
  it('refuses to start when the deployment has no Google web client id', async () => {
    await expect(requestGoogleCredential()).rejects.toThrow(
      'Google sign-in is not configured on this deployment.',
    );
  });

  it('asks Google for the profile scope in its own window and returns the access token', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const browser = stubBrowser((url) => ({ access_token: 'ya29.login', state: url.state }));

    await expect(requestGoogleCredential()).resolves.toEqual({ accessToken: 'ya29.login' });
    expect(browser.opened).toHaveLength(1);
    expect(browser.opened[0]?.searchParams.get('scope')).toBe(SIGN_IN_SCOPE);
    expect(browser.opened[0]?.searchParams.get('prompt')).toBe('select_account');
    expect(browser.opened[0]?.searchParams.get('redirect_uri')).toBe(
      'https://alexalghisi.github.io/collab/',
    );
    browser.restore();
  });

  it('opens the Google window in the same turn as the click', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const browser = stubBrowser((url) => ({ access_token: 'ya29.login', state: url.state }));

    const pending = requestGoogleCredential();

    expect(browser.opened).toHaveLength(1);
    await expect(pending).resolves.toEqual({ accessToken: 'ya29.login' });
    browser.restore();
  });

  it('does not load the Google Identity Services script', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const browser = stubBrowser((url) => ({ access_token: 'ya29.login', state: url.state }));

    await requestGoogleCredential();

    expect((globalThis as GoogleGlobal).google).toBeUndefined();
    browser.restore();
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

  it('reports a refused account choice as a cancelled sign-in', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const browser = stubBrowser((url) => ({ error: 'access_denied', state: url.state }));

    await expect(requestGoogleCredential()).rejects.toThrow('Google sign-in was cancelled.');
    browser.restore();
  });

  it('passes on whatever Google says about a failure it has no name for', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const browser = stubBrowser((url) => ({ error: 'server_error', state: url.state }));

    await expect(requestGoogleCredential()).rejects.toThrow('server_error');
    browser.restore();
  });

  it('says so when the browser blocks the Google window', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    const browser = stubBrowser(null);

    await expect(requestGoogleCredential()).rejects.toThrow(
      'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
    );
    browser.restore();
  });
});
