import { afterEach, describe, expect, it, vi } from 'vitest';
import { calendarServerStatus, refreshCalendarOnServer } from './calendarServer';

vi.mock('../auth/session', () => ({ readSessionToken: () => 'session' }));
vi.mock('../signaling/config', () => ({ SIGNALING_URL: 'https://signal.test' }));

afterEach(() => {
  vi.unstubAllGlobals();
});

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('calendarServerStatus', () => {
  it('reports what the server answers', async () => {
    answer(200, { configured: true, connected: false });

    await expect(calendarServerStatus()).resolves.toEqual({ configured: true, connected: false });
  });

  it('is unknown, not "unconfigured", while the server is down or waking up', async () => {
    answer(503, {});
    await expect(calendarServerStatus()).resolves.toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    await expect(calendarServerStatus()).resolves.toBeNull();
  });
});

describe('refreshCalendarOnServer', () => {
  it('sends the sealed grant and returns the renewed one', async () => {
    const fetchMock = answer(200, { accessToken: 'a', expiresIn: 3600, grant: 'next' });

    const access = await refreshCalendarOnServer('sealed');

    expect(access).toMatchObject({ accessToken: 'a', grant: 'next' });
    const init = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init[1].body))).toEqual({ grant: 'sealed' });
  });
});
