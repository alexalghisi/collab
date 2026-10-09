import { readGoogleWebClientId } from './config';
import type { GoogleCredential } from './types';

/**
 * Google only reports a cancelled or blocked window through `error_callback`.
 * Without it the token request simply never answers, which on screen is a
 * button that was pressed and then did nothing at all.
 */
interface TokenClientError {
  readonly type?: string;
  readonly message?: string;
}

interface GoogleIdentity {
  id: {
    initialize(config: {
      client_id: string;
      callback: (response: { credential?: string }) => void;
    }): void;
    prompt(
      callback?: (notification: { isNotDisplayed(): boolean; isSkippedMoment(): boolean }) => void,
    ): void;
  };
  oauth2?: {
    initTokenClient(config: {
      client_id: string;
      scope: string;
      callback: (response: { access_token?: string; error?: string }) => void;
      error_callback?: (error: TokenClientError) => void;
    }): { requestAccessToken: (opts?: { prompt?: string }) => void };
  };
}

export function describeTokenClientError(error: TokenClientError, fallback: string): string {
  if (error.type === 'popup_failed_to_open') {
    return 'Your browser blocked the Google window. Allow pop-ups for this site and try again.';
  }
  if (error.type === 'popup_closed') {
    return fallback;
  }
  return error.message || fallback;
}

function googleApi(): GoogleIdentity | undefined {
  const candidate = (globalThis as { google?: { accounts?: GoogleIdentity } }).google?.accounts;
  return candidate?.id ? candidate : undefined;
}

const SCRIPT_UNAVAILABLE = 'Could not load Google Sign-In. Check your connection and try again.';

/**
 * A network that swallows the request to accounts.google.com instead of
 * refusing it never fires `error`, so the load is given a deadline of its own.
 */
const SCRIPT_TIMEOUT_MS = 15_000;

function loadScript(): Promise<void> {
  if (googleApi()) {
    return Promise.resolve();
  }
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Google sign-in is only available in the browser.'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(SCRIPT_UNAVAILABLE)), SCRIPT_TIMEOUT_MS);
    const settle = (outcome: () => void) => () => {
      clearTimeout(timer);
      outcome();
    };
    const succeed = settle(() => resolve());
    const fail = settle(() => reject(new Error(SCRIPT_UNAVAILABLE)));

    const existing = document.querySelector('script[data-collab-google="true"]');
    if (existing) {
      existing.addEventListener('load', succeed);
      existing.addEventListener('error', fail);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.collabGoogle = 'true';
    script.onload = succeed;
    script.onerror = fail;
    document.head.appendChild(script);
  });
}

function requestAccessToken(api: GoogleIdentity, clientId: string): Promise<string> {
  const oauth = api.oauth2;
  if (!oauth) {
    return Promise.reject(new Error('Could not load Google Sign-In.'));
  }
  return new Promise((resolve, reject) => {
    const cancelled = 'Google sign-in was cancelled.';
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      callback: (response) => {
        if (response.access_token) {
          resolve(response.access_token);
          return;
        }
        reject(new Error(response.error || cancelled));
      },
      error_callback: (error) => {
        reject(new Error(describeTokenClientError(error, cancelled)));
      },
    });
    client.requestAccessToken({ prompt: 'select_account' });
  });
}

interface ElectronAuth {
  readonly isElectron?: boolean;
  readonly clientId?: string;
  loginWithGoogle?(clientId: string): Promise<GoogleCredential>;
  requestCalendarToken?(clientId: string, prompt: string): Promise<string>;
}

function getElectronAuth(): ElectronAuth | undefined {
  const candidate = (globalThis as unknown as { electronAuth?: ElectronAuth }).electronAuth;
  return candidate?.isElectron ? candidate : undefined;
}

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export async function requestGoogleCalendarToken(prompt: '' | 'consent' = ''): Promise<string> {
  const electronAuth = getElectronAuth();
  if (electronAuth?.requestCalendarToken) {
    const clientId = readGoogleWebClientId() || electronAuth.clientId;
    if (!clientId) {
      throw new Error('Google Calendar is not configured on this deployment.');
    }
    return electronAuth.requestCalendarToken(clientId, prompt);
  }

  const clientId = readGoogleWebClientId();
  if (!clientId) {
    throw new Error('Google Calendar is not configured on this deployment.');
  }
  await loadScript();
  const api = googleApi();
  const oauth = api?.oauth2;
  if (!oauth) {
    throw new Error('Could not load Google Sign-In.');
  }
  return new Promise((resolve, reject) => {
    const cancelled = 'Google Calendar access was cancelled.';
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: CALENDAR_SCOPE,
      callback: (response) => {
        if (response.access_token) {
          resolve(response.access_token);
          return;
        }
        reject(
          new Error(
            response.error === 'access_denied'
              ? 'Google Calendar access was not granted.'
              : response.error || cancelled,
          ),
        );
      },
      error_callback: (error) => {
        reject(new Error(describeTokenClientError(error, cancelled)));
      },
    });
    client.requestAccessToken({ prompt });
  });
}

export async function requestGoogleCredential(): Promise<GoogleCredential> {
  const electronAuth = getElectronAuth();
  if (electronAuth?.loginWithGoogle) {
    const clientId = readGoogleWebClientId() || electronAuth.clientId;
    if (!clientId) {
      throw new Error('Google sign-in is not configured on this deployment.');
    }
    return electronAuth.loginWithGoogle(clientId);
  }

  const clientId = readGoogleWebClientId();
  if (!clientId) {
    throw new Error('Google sign-in is not configured on this deployment.');
  }
  const ready = googleApi();
  if (!ready) {
    await loadScript();
  }
  const api = ready ?? googleApi();
  if (!api) {
    throw new Error('Could not load Google Sign-In.');
  }
  return { accessToken: await requestAccessToken(api, clientId) };
}

if (typeof document !== 'undefined') {
  void loadScript().catch(() => undefined);
}
