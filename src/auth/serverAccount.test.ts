import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitUntilSignalingReady } from '../signaling/wake';
import { loginWithGoogle } from './serverAccount';

vi.mock('../signaling/config', () => ({
  SIGNALING_URL: 'https://collab-signaling.onrender.com',
}));

vi.mock('../signaling/wake', async () => {
  const actual = (await vi.importActual('../signaling/wake')) as Record<string, unknown>;
  return {
    ...actual,
    waitUntilSignalingReady: vi.fn(async () => undefined),
  };
});

const fetchMock = vi.fn();

function sessionResponse(): Response {
  return new Response(
    JSON.stringify({
      token: 'session-token',
      user: {
        uid: 'u1',
        displayName: 'Ada',
        email: 'ada@university.edu',
        photoURL: null,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(waitUntilSignalingReady).mockReset();
  vi.mocked(waitUntilSignalingReady).mockResolvedValue(undefined);
});

describe('loginWithGoogle', () => {
  it('wakes the account service, then posts the access token', async () => {
    fetchMock.mockResolvedValue(sessionResponse());

    await expect(loginWithGoogle({ accessToken: 'ya29.token' })).resolves.toEqual({
      token: 'session-token',
      user: {
        uid: 'u1',
        displayName: 'Ada',
        email: 'ada@university.edu',
        photoURL: null,
      },
    });

    expect(waitUntilSignalingReady).toHaveBeenCalledWith('https://collab-signaling.onrender.com');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://collab-signaling.onrender.com/auth/google',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ accessToken: 'ya29.token' }),
      }),
    );
  });

  it('posts again when the first attempt is dropped', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(sessionResponse());

    await expect(loginWithGoogle({ accessToken: 'ya29.token' })).resolves.toMatchObject({
      token: 'session-token',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(waitUntilSignalingReady).toHaveBeenCalledTimes(2);
  });

  it('keeps the account-service error when the host never answers', async () => {
    vi.mocked(waitUntilSignalingReady).mockRejectedValue(new Error('down'));

    await expect(loginWithGoogle({ accessToken: 'ya29.token' })).rejects.toThrow(
      'Could not reach the account service. Try again in a moment.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry a rejected Google credential', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Google could not verify that sign-in.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(loginWithGoogle({ accessToken: 'ya29.bad' })).rejects.toThrow(
      'Google could not verify that sign-in.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
