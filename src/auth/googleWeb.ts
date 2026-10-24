import { readGoogleWebClientId } from './config';
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
    initCodeClient?(config: {
      client_id: string;
      scope: string;
      ux_mode: 'popup';
      callback: (response: { code?: string; error?: string }) => void;
    }): { requestCode: () => void };
  };
}

/** Offline consent result: the server redeems the code with redirect_uri "postmessage". */
export interface CalendarAuthCode {
  readonly code: string;
  readonly redirectUri: 'postmessage';
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

function requestAccessToken(
  api: GoogleIdentity,
  clientId: string,
  options: { scope: string; prompt: string; cancelled?: string; denied?: string } = {
    scope: 'openid email profile',
    prompt: 'select_account',
  },
): Promise<string> {
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
      scope: options.scope,
      callback: (response) => {
        const accessToken = response.access_token;
        if (accessToken) {
          finish(() => resolve(accessToken));
          return;
        }
        const message =
          response.error === 'access_denied' && options.denied
            ? options.denied
            : response.error || options.cancelled || POPUP_CANCELLED;
        finish(() => reject(new Error(message)));
      },
    });
    stopWatching = watchForClosedGoogleWindow((message) =>
      finish(() => reject(new Error(message))),
    );
    const blocked = openGoogleWindow(() => client.requestAccessToken({ prompt: options.prompt }));
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
  // The GIS token client needs only the app's JavaScript origin in the OAuth
  // client. A redirect popup would also need https://<host>/collab/ registered
  // as a redirect URI, and Google answers "Error 400: redirect_uri_mismatch"
  // when it is not. Sign-in uses the same client and the same window watcher.
  const ready = googleApi();
  if (!ready) {
    await loadScript();
  }
  const api = ready ?? googleApi();
  if (!api) {
    throw new Error('Could not load Google Sign-In.');
  }
  return requestAccessToken(api, clientId, {
    scope: CALENDAR_SCOPE,
    prompt,
    cancelled: 'Google Calendar access was cancelled.',
    denied: 'Google Calendar access was not granted.',
  });
}

/**
 * One-time offline consent for Google Calendar through the GIS code client (web only, not the
 * desktop shell). The server redeems the code and keeps the refresh token, so access never has
 * to be granted again. Returns null where only the short-lived token flow exists.
 */
export async function requestGoogleCalendarCode(): Promise<CalendarAuthCode | null> {
  if (getElectronAuth()) {
    return null;
  }
  const clientId = readGoogleWebClientId();
  if (!clientId) {
    throw new Error('Google Calendar is not configured on this deployment.');
  }
  const ready = googleApi();
  if (!ready) {
    await loadScript();
  }
  const api = ready ?? googleApi();
  const initCodeClient = api?.oauth2?.initCodeClient;
  if (!api?.oauth2 || !initCodeClient) {
    return null;
  }
  const oauth = api.oauth2;
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
    const client = initCodeClient.call(oauth, {
      client_id: clientId,
      scope: CALENDAR_SCOPE,
      ux_mode: 'popup',
      callback: (response) => {
        const code = response.code;
        if (code) {
          finish(() => resolve({ code, redirectUri: 'postmessage' }));
          return;
        }
        const message =
          response.error === 'access_denied'
            ? 'Google Calendar access was not granted.'
            : response.error || 'Google Calendar access was cancelled.';
        finish(() => reject(new Error(message)));
      },
    });
    stopWatching = watchForClosedGoogleWindow(() =>
      finish(() => reject(new Error('Google Calendar access was cancelled.'))),
    );
    const blocked = openGoogleWindow(() => client.requestCode());
    if (blocked) {
      finish(() => reject(new Error(POPUP_BLOCKED)));
    }
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
