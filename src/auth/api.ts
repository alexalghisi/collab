import { SIGNALING_URL } from '../signaling/config';
import type { Account, AuthSession, Credentials, SignUpDraft } from './types';

/** Accounts live in the signaling server's own database, so it is the same origin. */
export const ACCOUNTS_URL = SIGNALING_URL;

const OFFLINE = 'Could not reach the account service.';

/**
 * Anything the person signing in should be shown. `status` is the answer the
 * server gave, or null when the request never arrived — the difference decides
 * whether a stored session is stale or the server is simply asleep.
 */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ACCOUNTS_URL}${path}`, init);
  } catch {
    throw new AuthError(OFFLINE, null);
  }
  const body = (await response.json().catch(() => ({}))) as { error?: unknown } & T;
  if (!response.ok) {
    throw new AuthError(
      typeof body.error === 'string' ? body.error : 'That did not work. Try again.',
      response.status,
    );
  }
  return body;
}

const json = (body: unknown, token?: string): RequestInit => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

const authorized = (token: string): RequestInit => ({
  headers: { Authorization: `Bearer ${token}` },
});

export function signUp(draft: SignUpDraft): Promise<AuthSession> {
  return call<AuthSession>('/accounts/signup', json(draft));
}

export function logIn(credentials: Credentials): Promise<AuthSession> {
  return call<AuthSession>('/accounts/login', json(credentials));
}

export async function logOut(token: string): Promise<void> {
  try {
    await fetch(`${ACCOUNTS_URL}/accounts/logout`, json({}, token));
  } catch {
    // Signing out locally is what matters; the token expires on its own.
  }
}

/** Confirms a stored token still belongs to somebody. */
export async function fetchSelf(token: string): Promise<Account> {
  const { account } = await call<{ account: Account }>('/accounts/me', authorized(token));
  return account;
}

/** Everyone with an account here, for inviting people to a meeting by name. */
export async function fetchDirectory(token: string): Promise<Account[]> {
  const { accounts } = await call<{ accounts: Account[] }>('/accounts', authorized(token));
  return accounts;
}
