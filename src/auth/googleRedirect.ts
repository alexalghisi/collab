import { readGoogleWebClientId } from './config';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PENDING_KEY = 'collab.google.redirect';
const CALENDAR_HANDOFF_KEY = 'collab.google.calendarHandoff';
const CALENDAR_ERROR_KEY = 'collab.google.calendarError';

export type GoogleRedirectPurpose = 'sign-in' | 'calendar';

export interface PendingGoogleRedirect {
  readonly purpose: GoogleRedirectPurpose;
  readonly state: string;
  readonly verifier: string;
  readonly redirectUri: string;
}

export type GoogleRedirectResult =
  | { readonly purpose: GoogleRedirectPurpose; readonly accessToken: string }
  | { readonly purpose: GoogleRedirectPurpose; readonly error: string };

type CalendarListener = (accessToken: string) => void;

const calendarListeners = new Set<CalendarListener>();

export function isIosBrowser(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/i.test(userAgent)) {
    return true;
  }
  // iPadOS reports itself as a Mac, and only the touch points give it away.
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function prefersGoogleRedirect(): boolean {
  const nav = globalThis.navigator as { userAgent?: string; maxTouchPoints?: number } | undefined;
  if (!nav?.userAgent) {
    return false;
  }
  return isIosBrowser(nav.userAgent, nav.maxTouchPoints ?? 0);
}

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function googleAuthorizeUrl(input: {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scope: string;
  readonly state: string;
  readonly codeChallenge: string;
  readonly prompt: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: input.scope,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    prompt: input.prompt,
    include_granted_scopes: 'true',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export function readOAuthReturn(
  search: string,
): { readonly code: string; readonly state: string } | { readonly error: string } | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const error = params.get('error');
  if (error) {
    return { error };
  }
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) {
    return null;
  }
  return { code, state };
}

function redirectError(code: string): string {
  if (code === 'access_denied') {
    return 'Google sign-in was cancelled.';
  }
  if (code === 'redirect_uri_mismatch') {
    return 'Google sign-in is not allowed to return to this page.';
  }
  return 'Google sign-in failed. Please try again.';
}

function browserSession(): Storage | null {
  const store = (globalThis as { sessionStorage?: Storage }).sessionStorage;
  return store ?? null;
}

function browserLocation(): {
  origin: string;
  pathname: string;
  search: string;
  assign(url: string): void;
} | null {
  const loc = (globalThis as { location?: Location }).location;
  if (!loc?.assign || !loc.origin) {
    return null;
  }
  return loc;
}

function readPending(raw: string | null): PendingGoogleRedirect | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PendingGoogleRedirect>;
    if (
      (parsed.purpose !== 'sign-in' && parsed.purpose !== 'calendar') ||
      typeof parsed.state !== 'string' ||
      typeof parsed.verifier !== 'string' ||
      typeof parsed.redirectUri !== 'string'
    ) {
      return null;
    }
    return {
      purpose: parsed.purpose,
      state: parsed.state,
      verifier: parsed.verifier,
      redirectUri: parsed.redirectUri,
    };
  } catch {
    return null;
  }
}

function clearOAuthQuery(): void {
  const historyRef = (globalThis as { history?: History }).history;
  const loc = browserLocation();
  if (!historyRef?.replaceState || !loc) {
    return;
  }
  historyRef.replaceState({}, '', `${loc.origin}${loc.pathname}`);
}

async function exchangeCode(
  pending: PendingGoogleRedirect,
  code: string,
  clientId: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.verifier,
  });
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(redirectError(payload.error ?? 'token'));
  }
  return payload.access_token;
}

/**
 * Leaves this page for Google and comes back with a code. iPhone Safari blocks
 * the popup the desktop button uses, so the whole page is the only reliable path.
 */
export async function beginGoogleRedirect(input: {
  readonly purpose: GoogleRedirectPurpose;
  readonly scope: string;
  readonly prompt: string;
}): Promise<void> {
  const clientId = readGoogleWebClientId();
  if (!clientId) {
    throw new Error(
      input.purpose === 'calendar'
        ? 'Google Calendar is not configured on this deployment.'
        : 'Google sign-in is not configured on this deployment.',
    );
  }
  const store = browserSession();
  const loc = browserLocation();
  if (!store || !loc) {
    throw new Error('Google sign-in is only available in the browser.');
  }
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const redirectUri = `${loc.origin}${loc.pathname}`;
  const pending: PendingGoogleRedirect = {
    purpose: input.purpose,
    state,
    verifier,
    redirectUri,
  };
  store.setItem(PENDING_KEY, JSON.stringify(pending));
  loc.assign(
    googleAuthorizeUrl({
      clientId,
      redirectUri,
      scope: input.scope,
      state,
      codeChallenge: await pkceChallenge(verifier),
      prompt: input.prompt,
    }),
  );
}

/** Finishes a redirect that has just landed back on this page. No-op otherwise. */
export async function resumeGoogleRedirect(
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleRedirectResult | null> {
  const store = browserSession();
  const loc = browserLocation();
  if (!store || !loc) {
    return null;
  }
  const pending = readPending(store.getItem(PENDING_KEY));
  const returned = readOAuthReturn(loc.search ?? '');
  if (!pending || !returned) {
    return null;
  }
  store.removeItem(PENDING_KEY);
  clearOAuthQuery();
  if ('error' in returned) {
    const error = redirectError(returned.error);
    if (pending.purpose === 'calendar') {
      browserSession()?.setItem(CALENDAR_ERROR_KEY, error);
    }
    return { purpose: pending.purpose, error };
  }
  if (returned.state !== pending.state) {
    return { purpose: pending.purpose, error: 'Google sign-in failed. Please try again.' };
  }
  const clientId = readGoogleWebClientId();
  if (!clientId) {
    return {
      purpose: pending.purpose,
      error: 'Google sign-in is not configured on this deployment.',
    };
  }
  try {
    const accessToken = await exchangeCode(pending, returned.code, clientId, fetchImpl);
    if (pending.purpose === 'calendar') {
      publishCalendarRedirect(accessToken);
    }
    return { purpose: pending.purpose, accessToken };
  } catch (cause) {
    return {
      purpose: pending.purpose,
      error: cause instanceof Error ? cause.message : 'Google sign-in failed. Please try again.',
    };
  }
}

export function publishCalendarRedirect(accessToken: string): void {
  browserSession()?.setItem(CALENDAR_HANDOFF_KEY, accessToken);
  for (const listener of calendarListeners) {
    listener(accessToken);
  }
}

export function takeCalendarError(): string | null {
  const store = browserSession();
  const message = store?.getItem(CALENDAR_ERROR_KEY) ?? null;
  if (message) {
    store?.removeItem(CALENDAR_ERROR_KEY);
  }
  return message;
}

export function takeCalendarHandoff(): string | null {
  const store = browserSession();
  const token = store?.getItem(CALENDAR_HANDOFF_KEY) ?? null;
  if (token) {
    store?.removeItem(CALENDAR_HANDOFF_KEY);
  }
  return token;
}

export function onCalendarRedirect(listener: CalendarListener): () => void {
  calendarListeners.add(listener);
  return () => {
    calendarListeners.delete(listener);
  };
}
