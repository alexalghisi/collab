import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNTS_URL, AuthError, fetchDirectory, requestSignIn, requestSignUp } from './accounts';

const session = {
  account: { id: 'a1', name: 'Ada Lovelace', email: 'ada@example.com', createdAt: 1 },
  token: 'token-1',
};

describe('the account client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts a sign-up and returns the session the server handed out', async () => {
    const fetchMock = vi.fn(async () => Response.json(session, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const created = await requestSignUp({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'analytical-engine',
    });

    expect(created).toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith(
      `${ACCOUNTS_URL}/auth/signup`,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('ada@example.com'),
      }),
    );
  });

  it('shows the message the server gave for a refused sign-in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: 'That email and password do not match an account.' },
          { status: 401 },
        ),
      ),
    );

    await expect(
      requestSignIn({ email: 'ada@example.com', password: 'guess' }),
    ).rejects.toMatchObject({ status: 401, message: /do not match/i });
  });

  it('says the service is unreachable rather than throwing the transport error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const failure = await requestSignIn({ email: 'ada@example.com', password: 'guess' }).catch(
      (cause: unknown) => cause,
    );

    expect(failure).toBeInstanceOf(AuthError);
    expect(failure).toMatchObject({ status: 0, message: /could not reach/i });
  });

  it('carries the token when asking for the directory', async () => {
    const people = [session.account];
    const fetchMock = vi.fn(async () => Response.json({ people }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDirectory('token-1')).resolves.toEqual(people);
    expect(fetchMock).toHaveBeenCalledWith(
      `${ACCOUNTS_URL}/auth/directory`,
      expect.objectContaining({ headers: { Authorization: 'Bearer token-1' } }),
    );
  });
});
