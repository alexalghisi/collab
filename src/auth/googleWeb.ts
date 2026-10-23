import { readGoogleWebClientId } from './config';
import { requestTokenInPopup } from './googleOAuthPopup';
import type { GoogleCredential } from './types';

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
    }): { requestAccessToken: (opts?: { prompt?: string }) => void };
  };
}

const POPUP_BLOCKED =
  'Your browser blocked the Google window. Allow pop-ups for this site and try again.';
const POPUP_CANCELLED = 'Google sign-in was cancelled.';
const POPUP_CANCEL_GRACE_MS = 8_000;

function watchForClosedGoogleWindow(cancel: (message: string) => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => undefined;
  }
  let blurred = false;
  let cancelTimer: ReturnType<typeof setTimeout> | undefined;
  const onBlur = () => {
    blurred = true;
    clearTimeout(cancelTimer);
  };
  const onFocus = () => {
    if (!blurred) {
      return;
    }
    clearTimeout(cancelTimer);
    cancelTimer = setTimeout(() => cancel(POPUP_CANCELLED), POPUP_CANCEL_GRACE_MS);
  };
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  return () => {
    clearTimeout(cancelTimer);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
  };
}

function openGoogleWindow(open: () => void): boolean {
  if (typeof window === 'undefined' || typeof window.open !== 'function') {
    open();
    return false;
  }
  const original = window.open;
  let blocked = false;
  window.open = (url, target, features) => {
    const child = original.call(window, url, target, features);
    if (child === null) {
      blocked = true;
    }
    return child;
  };
  try {
    open();
  } finally {
    window.open = original;
  }
  return blocked;
}

function googleApi(): GoogleIdentity | undefined {
  const candidate = (globalThis as { google?: { accounts?: GoogleIdentity } }).google?.accounts;
  return candidate?.id ? candidate : undefined;
}

const SCRIPT_UNAVAILABLE = 'Could not load Google Sign-In. Check your connection and try again.';
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
    let settled = false;
    let stopWatching = (): void => undefined;
    const finish = (outcome: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      stopWatching();
      outcome();
    };
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      callback: (response) => {
        const accessToken = response.access_token;
        if (accessToken) {
          finish(() => resolve(accessToken));
          return;
        }
        finish(() => reject(new Error(response.error || POPUP_CANCELLED)));
      },
    });
    stopWatching = watchForClosedGoogleWindow((message) =>
      finish(() => reject(new Error(message))),
    );
    const blocked = openGoogleWindow(() => client.requestAccessToken({ prompt: 'select_account' }));
    if (blocked) {
      finish(() => reject(new Error(POPUP_BLOCKED)));
    }
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
  // Own popup flow instead of the GIS token client: GIS polls popup.closed,
  // which Google's COOP header turns into console errors on every poll.
  const { accessToken } = await requestTokenInPopup({
    clientId,
    scope: CALENDAR_SCOPE,
    prompt,
    cancelledMessage: 'Google Calendar access was cancelled.',
  });
  return accessToken;
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
