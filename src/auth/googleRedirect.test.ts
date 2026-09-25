import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginGoogleRedirect,
  googleAuthorizeUrl,
  isIosBrowser,
  onCalendarRedirect,
  pkceChallenge,
  readOAuthReturn,
  resumeGoogleRedirect,
  takeCalendarHandoff,
} from './googleRedirect';

const CLIENT_ID = 'collab.apps.googleusercontent.com';

describe('iPhone Google redirect', () => {
  it('treats an iPhone, an iPad, and an iPad pretending to be a Mac as a redirect', () => {
    expect(isIosBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)')).toBe(true);
    expect(isIosBrowser('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)')).toBe(true);
    expect(isIosBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIosBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIosBrowser('Mozilla/5.0 (Linux; Android 14)')).toBe(false);
  });

  it('builds an authorization URL that comes back to this page with PKCE', async () => {
    const challenge = await pkceChallenge('verifier-value');
    const url = new URL(
      googleAuthorizeUrl({
        clientId: CLIENT_ID,
        redirectUri: 'https://alexalghisi.github.io/collab/',
        scope: 'openid email profile',
        state: 'state-1',
        codeChallenge: challenge,
        prompt: 'select_account',
      }),
    );

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe('https://alexalghisi.github.io/collab/');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(challenge);
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });

  it('reads a code or a refusal from the return URL', () => {
    expect(readOAuthReturn('?code=abc&state=state-1')).toEqual({ code: 'abc', state: 'state-1' });
    expect(readOAuthReturn('?error=access_denied&state=state-1')).toEqual({
      error: 'access_denied',
    });
    expect(readOAuthReturn('')).toBeNull();
  });
});

describe('beginGoogleRedirect and resumeGoogleRedirect', () => {
  const memory = new Map<string, string>();
  const assign = vi.fn();

  afterEach(() => {
    memory.clear();
    assign.mockReset();
    vi.unstubAllGlobals();
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  });

  function stubBrowser(search: string): void {
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    });
    vi.stubGlobal('location', {
      origin: 'https://alexalghisi.github.io',
      pathname: '/collab/',
      search,
      assign,
    });
    vi.stubGlobal('history', { replaceState: vi.fn() });
  }

  it('sends an iPhone sign-in to Google and stores the verifier for the return', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    stubBrowser('');

    await beginGoogleRedirect({
      purpose: 'sign-in',
      scope: 'openid email profile',
      prompt: 'select_account',
    });

    expect(assign).toHaveBeenCalledOnce();
    const url = new URL(assign.mock.calls[0][0] as string);
    expect(url.searchParams.get('redirect_uri')).toBe('https://alexalghisi.github.io/collab/');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const pending = JSON.parse(memory.get('collab.google.redirect') ?? '{}') as {
      purpose: string;
      state: string;
      verifier: string;
    };
    expect(pending.purpose).toBe('sign-in');
    expect(url.searchParams.get('state')).toBe(pending.state);
    expect(pending.verifier.length).toBeGreaterThan(10);
  });

  it('exchanges the returning code and hands a calendar token to the open page', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    memory.set(
      'collab.google.redirect',
      JSON.stringify({
        purpose: 'calendar',
        state: 'state-1',
        verifier: 'verifier-1',
        redirectUri: 'https://alexalghisi.github.io/collab/',
      }),
    );
    stubBrowser('?code=auth-code&state=state-1');
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: 'ya29.phone' }),
    })) as unknown as typeof fetch;
    const heard = vi.fn();
    const stop = onCalendarRedirect(heard);

    const result = await resumeGoogleRedirect(fetchImpl);

    expect(result).toEqual({ purpose: 'calendar', accessToken: 'ya29.phone' });
    expect(heard).toHaveBeenCalledWith('ya29.phone');
    expect(takeCalendarHandoff()).toBe('ya29.phone');
    expect(memory.has('collab.google.redirect')).toBe(false);
    const body = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as {
      body: URLSearchParams;
    };
    expect(body.body.get('code')).toBe('auth-code');
    expect(body.body.get('code_verifier')).toBe('verifier-1');
    expect(body.body.get('redirect_uri')).toBe('https://alexalghisi.github.io/collab/');
    stop();
  });

  it('reports a cancelled return instead of signing in', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    memory.set(
      'collab.google.redirect',
      JSON.stringify({
        purpose: 'sign-in',
        state: 'state-1',
        verifier: 'verifier-1',
        redirectUri: 'https://alexalghisi.github.io/collab/',
      }),
    );
    stubBrowser('?error=access_denied&state=state-1');

    await expect(resumeGoogleRedirect()).resolves.toEqual({
      purpose: 'sign-in',
      error: 'Google sign-in was cancelled.',
    });
  });
});
