import type { GoogleCredential } from './types';

export async function requestGoogleCredential(): Promise<GoogleCredential> {
  throw new Error('Use the native Google sign-in button.');
}

export async function requestGoogleCalendarToken(_prompt?: '' | 'consent'): Promise<string> {
  throw new Error('Google Calendar sync is available in the web app.');
}
