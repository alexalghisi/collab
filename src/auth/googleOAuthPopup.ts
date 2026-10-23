/**
 * Google OAuth (implicit token flow) in a popup that never touches the popup
 * window object after opening it.
 *
 * Google Identity Services polls `popup.closed` to notice a dismissed popup.
 * Google's sign-in pages send a Cross-Origin-Opener-Policy header, so every
 * poll logs "Cross-Origin-Opener-Policy policy would block the window.closed
 * call" in the console. Here the popup is redirected back to this app, which
 * hands the result over through BroadcastChannel / localStorage (same origin,
 * unaffected by COOP) and closes itself — no cross-origin window access at all.
 *
 * On phones the window is another tab and the opener is suspended while it is
 * open, so live messages can be missed. The result therefore stays in
 * localStorage until the opener claims it on returning to the foreground.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const CHANNEL_NAME = 'collab.google-oauth';
const STORAGE_KEY = 'collab.google-oauth.result';
const STATE_PREFIX = 'collab-oauth.';
const POPUP_NAME = 'collab-google-oauth';
const POPUP_FEATURES = 'popup,width=520,height=680';
const TIMEOUT_MS = 5 * 60_000;
const CANCEL_GRACE_MS = 2_500;

export interface OAuthRedirectResult {
  readonly state: string;
  readonly accessToken?: string;
  readonly expiresIn?: number;
  readonly error?: string;
}

export interface OAuthPopupRequest {
  readonly clientId: string;
  readonly scope: string;
  readonly prompt?: string;
  readonly cancelledMessage: string;
  readonly deniedMessage: string;
}

export interface OAuthToken {
  readonly accessToken: string;
  readonly expiresIn?: number;
}

export function parseOAuthRedirect(hash: string): OAuthRedirectResult | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state = params.get('state');
  if (!state || !state.startsWith(STATE_PREFIX)) {
    return null;
  }
  const expires = Number(params.get('expires_in'));
  return {
    state,
    accessToken: params.get('access_token') ?? undefined,
    expiresIn: Number.isFinite(expires) && expires > 0 ? expires : undefined,
    error: params.get('error') ?? undefined,
  };
}

/** The page Google sends the popup back to: this app's own entry URL. */
export function oauthRedirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function deliver(result: OAuthRedirectResult): void {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(result);
    channel.close();
  } catch {
    // BroadcastChannel missing: the storage event below still delivers it.
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {
    return;
  }
}

function readStoredResult(): OAuthRedirectResult | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as OAuthRedirectResult) : null;
  } catch {
    return null;
  }
}

function clearStoredResult(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}

/**
 * Runs before the app boots. When this window is the OAuth popup coming back
 * from Google, it passes the result to the opener tab and closes itself.
 * Returns true when it handled the redirect (the app should not render).
 */
export function completeOAuthRedirect(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof window.location?.hash !== 'string'
  ) {
    return false;
  }
  const result = parseOAuthRedirect(window.location.hash);
  if (!result) {
    return false;
  }
  window.history.replaceState(null, '', oauthRedirectUri() + window.location.search);
  deliver(result);
  window.close();
  // Only reached when the browser refuses to close the window.
  document.body.textContent = 'Done — you can close this window.';
  return true;
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return STATE_PREFIX + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function describeError(error: string, request: OAuthPopupRequest): string {
  if (error === 'access_denied') {
    return request.deniedMessage;
  }
  if (error === 'popup_closed' || error === 'user_cancelled') {
    return request.cancelledMessage;
  }
  return error || request.cancelledMessage;
}

export function requestTokenInPopup(request: OAuthPopupRequest): Promise<OAuthToken> {
  const state = randomState();
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', request.clientId);
  url.searchParams.set('redirect_uri', oauthRedirectUri());
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope', request.scope);
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  if (request.prompt) {
    url.searchParams.set('prompt', request.prompt);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let channel: BroadcastChannel | null = null;
    let cancelTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (outcome: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      clearTimeout(cancelTimer);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('visibilitychange', claimStoredResult);
      channel?.close();
      outcome();
    };

    const accept = (result: OAuthRedirectResult | null) => {
      if (!result || result.state !== state) {
        return;
      }
      clearStoredResult();
      if (result.accessToken) {
        const token = result.accessToken;
        finish(() => resolve({ accessToken: token, expiresIn: result.expiresIn }));
        return;
      }
      const message = describeError(result.error ?? '', request);
      finish(() => reject(new Error(message)));
    };

    const claimStoredResult = () => accept(readStoredResult());

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) {
        return;
      }
      try {
        accept(JSON.parse(event.newValue) as OAuthRedirectResult);
      } catch {
        return;
      }
    };

    // The opener regains focus when the popup goes away. If no result shows
    // up shortly after, the person closed it.
    const onFocus = () => {
      claimStoredResult();
      if (settled) {
        return;
      }
      clearTimeout(cancelTimer);
      cancelTimer = setTimeout(() => {
        claimStoredResult();
        finish(() => reject(new Error(request.cancelledMessage)));
      }, CANCEL_GRACE_MS);
    };

    // Listen before opening, so a fast redirect is never missed.
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<OAuthRedirectResult>) => accept(event.data);
    } catch {
      channel = null;
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    window.addEventListener('visibilitychange', claimStoredResult);
    const timeout = setTimeout(
      () => finish(() => reject(new Error(request.cancelledMessage))),
      TIMEOUT_MS,
    );

    // Must run synchronously inside the click. The returned handle is never
    // read again (no popup.closed polling), which is what avoids the COOP errors.
    const opened = window.open(url.toString(), POPUP_NAME, POPUP_FEATURES);
    if (!opened) {
      finish(() =>
        reject(
          new Error(
            'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
          ),
        ),
      );
    }
  });
}
