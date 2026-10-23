import { readGoogleWebClientId } from './config';
import { requestTokenInPopup } from './googleOAuthPopup';
import type { GoogleCredential } from './types';

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

const SIGN_IN_CANCELLED = 'Google sign-in was cancelled.';
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
    deniedMessage: 'Google Calendar access was not granted.',
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
  const { accessToken } = await requestTokenInPopup({
    clientId,
    scope: 'openid email profile',
    prompt: 'select_account',
    cancelledMessage: SIGN_IN_CANCELLED,
    deniedMessage: SIGN_IN_CANCELLED,
  });
  return { accessToken };
}
