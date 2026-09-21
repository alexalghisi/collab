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
      scope: 'openid email profile',
      callback: (response) => {
        if (response.access_token) {
          resolve(response.access_token);
          return;
        }
        reject(new Error(response.error || 'Google sign-in was cancelled.'));
      },
    });
    client.requestAccessToken({ prompt: 'select_account' });
  });
}

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export async function requestGoogleCalendarToken(prompt: '' | 'consent' = ''): Promise<string> {
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
  const clientId = readGoogleWebClientId();
  if (!clientId) {
    throw new Error('Google sign-in is not configured on this deployment.');
  }
  await loadScript();
  const api = googleApi();
  if (!api) {
    throw new Error('Could not load Google Sign-In.');
  }
  return { accessToken: await requestAccessToken(api, clientId) };
}
