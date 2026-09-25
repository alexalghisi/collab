import { readGoogleWebClientId } from './config';
import { beginGoogleRedirect, prefersGoogleRedirect } from './googleRedirect';
import type { GoogleCredential } from './types';

const SIGN_IN_SCOPE = 'openid email profile';

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

function googleApi(): GoogleIdentity | undefined {
  const candidate = (globalThis as { google?: { accounts?: GoogleIdentity } }).google?.accounts;
  return candidate?.id ? candidate : undefined;
}

function loadScript(): Promise<void> {
  if (googleApi()) {
    return Promise.resolve();
  }
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Google sign-in is only available in the browser.'));
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-collab-google="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Could not load Google Sign-In.')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.collabGoogle = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google Sign-In.'));
    document.head.appendChild(script);
  });
}

function requestAccessToken(api: GoogleIdentity, clientId: string): Promise<string> {
  const oauth = api.oauth2;
  if (!oauth) {
    return Promise.reject(new Error('Could not load Google Sign-In.'));
  }
  return new Promise((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: SIGN_IN_SCOPE,
      callback: (response) => {
        if (response.access_token) {
          resolve(response.access_token);
          return;
        }
        if (response.error === 'popup_blocked' || response.error === 'popup_failed') {
          void beginGoogleRedirect({
            purpose: 'sign-in',
            scope: SIGN_IN_SCOPE,
            prompt: 'select_account',
          }).catch(reject);
          return;
        }
        reject(new Error(response.error || 'Google sign-in was cancelled.'));
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
  if (prefersGoogleRedirect() && prompt !== '') {
    await beginGoogleRedirect({ purpose: 'calendar', scope: CALENDAR_SCOPE, prompt });
    return new Promise(() => undefined);
  }
  await loadScript();
  const api = googleApi();
  const oauth = api?.oauth2;
  if (!oauth) {
    throw new Error('Could not load Google Sign-In.');
  }
  return new Promise((resolve, reject) => {
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
              : response.error || 'Google Calendar access was cancelled.',
          ),
        );
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
  if (prefersGoogleRedirect()) {
    await beginGoogleRedirect({
      purpose: 'sign-in',
      scope: SIGN_IN_SCOPE,
      prompt: 'select_account',
    });
    return new Promise(() => undefined);
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
