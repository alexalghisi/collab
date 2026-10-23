import { describe, expect, it, vi } from 'vitest';
import { parseOAuthRedirect, requestTokenInPopup } from './googleOAuthPopup';

describe('parseOAuthRedirect', () => {
  it('reads the token Google appends to the redirect', () => {
    expect(
      parseOAuthRedirect(
        '#state=collab-oauth.abc&access_token=ya29.x&expires_in=3599&token_type=Bearer',
      ),
    ).toEqual({
      state: 'collab-oauth.abc',
      accessToken: 'ya29.x',
      expiresIn: 3599,
      error: undefined,
    });
  });

  it('reads an error redirect', () => {
    expect(parseOAuthRedirect('#state=collab-oauth.abc&error=access_denied')).toMatchObject({
      state: 'collab-oauth.abc',
      error: 'access_denied',
      accessToken: undefined,
    });
  });

  it('ignores hashes that are not ours', () => {
    expect(parseOAuthRedirect('')).toBeNull();
    expect(parseOAuthRedirect('#access_token=ya29.x&state=someone-else')).toBeNull();
    expect(parseOAuthRedirect('#section-2')).toBeNull();
  });
});

interface SleepyBrowser {
  readonly storage: Map<string, string>;
  wake(): void;
  restore(): void;
}

/**
 * A phone browser: the Google window opens as another tab, the opener tab is
 * suspended, so the hand-back only lands in shared storage and the opener
 * learns about it when it comes back to the foreground.
 */
function stubSleepyBrowser(answer: (state: string) => Record<string, string>): SleepyBrowser {
  const storage = new Map<string, string>();
  const focusListeners: Array<() => void> = [];
  const g = globalThis as { window?: unknown; localStorage?: unknown };
  const previousWindow = g.window;
  const previousStorage = g.localStorage;
  g.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };
  g.window = {
    location: { origin: 'https://alexalghisi.github.io', pathname: '/collab/', hash: '' },
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'focus') {
        focusListeners.push(listener);
      }
    },
    removeEventListener: (type: string, listener: () => void) => {
      const index = focusListeners.indexOf(listener);
      if (type === 'focus' && index >= 0) {
        focusListeners.splice(index, 1);
      }
    },
    open: (href: string) => {
      const state = new URL(href).searchParams.get('state') ?? '';
      const hash = new URLSearchParams({ state, ...answer(state) }).toString();
      const result = parseOAuthRedirect(`#${hash}`);
      storage.set('collab.google-oauth.result', JSON.stringify(result));
      return {};
    },
  };
  return {
    storage,
    wake: () => focusListeners.slice().forEach((listener) => listener()),
    restore: () => {
      g.window = previousWindow;
      g.localStorage = previousStorage;
    },
  };
}

const REQUEST = {
  clientId: 'collab.apps.googleusercontent.com',
  scope: 'openid email profile',
  cancelledMessage: 'Google sign-in was cancelled.',
  deniedMessage: 'Google sign-in was cancelled.',
};

describe('requestTokenInPopup on a phone', () => {
  it('picks up the token left in storage when the tab comes back', async () => {
    const browser = stubSleepyBrowser(() => ({ access_token: 'ya29.phone', expires_in: '3599' }));

    const pending = requestTokenInPopup(REQUEST);
    browser.wake();

    await expect(pending).resolves.toEqual({ accessToken: 'ya29.phone', expiresIn: 3599 });
    expect(browser.storage.size).toBe(0);
    browser.restore();
  });

  it('reports the denial message when the stored hand-back is a refusal', async () => {
    const browser = stubSleepyBrowser(() => ({ error: 'access_denied' }));

    const pending = requestTokenInPopup({ ...REQUEST, deniedMessage: 'Access was not granted.' });
    browser.wake();

    await expect(pending).rejects.toThrow('Access was not granted.');
    browser.restore();
  });

  it('ignores a stored hand-back that belongs to another request', async () => {
    vi.useFakeTimers();
    const browser = stubSleepyBrowser(() => ({ access_token: 'ya29.phone' }));
    browser.storage.clear();
    browser.storage.set(
      'collab.google-oauth.result',
      JSON.stringify({ state: 'collab-oauth.someone-else', accessToken: 'ya29.stale' }),
    );
    const opened = (globalThis as { window: { open: unknown } }).window;
    opened.open = () => ({});

    const pending = requestTokenInPopup(REQUEST);
    browser.wake();
    vi.advanceTimersByTime(3_000);

    await expect(pending).rejects.toThrow('Google sign-in was cancelled.');
    vi.useRealTimers();
    browser.restore();
  });
});
