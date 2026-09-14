import { SIGNALING_URL } from '../signaling/config';

const configured = process.env.EXPO_PUBLIC_ACCOUNTS_URL?.trim();

/**
 * Accounts live in the signaling server's own database, so that URL is the
 * default. It only needs setting when the server is deployed elsewhere, or
 * when signaling runs through Firestore and therefore has no URL of its own.
 */
export const ACCOUNTS_URL = configured || SIGNALING_URL;

/** One person with an account on this deployment. */
export interface Account {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: number;
}

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export interface SignUpRequest extends Credentials {
  readonly name: string;
}

export interface AccountSession {
  readonly account: Account;
  readonly token: string;
}

/** Carries a message meant for the person signing in, and the status behind it. */
export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

const UNREACHABLE = 'Could not reach the account service.';

async function call<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ACCOUNTS_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new AuthError(0, UNREACHABLE);
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: unknown };
  if (!response.ok) {
    throw new AuthError(
      response.status,
      typeof body.error === 'string' ? body.error : 'The account service refused that.',
    );
  }
  return body;
}

export function requestSignUp(request: SignUpRequest): Promise<AccountSession> {
  return call<AccountSession>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function requestSignIn(credentials: Credentials): Promise<AccountSession> {
  return call<AccountSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function fetchAccount(token: string): Promise<Account> {
  const { account } = await call<{ account: Account }>('/auth/me', { method: 'GET' }, token);
  return account;
}

export async function fetchDirectory(token: string): Promise<Account[]> {
  const { people } = await call<{ people: Account[] }>('/auth/directory', { method: 'GET' }, token);
  return people;
}

/** Best effort: the client forgets the token whether or not the server hears about it. */
export async function forgetSession(token: string): Promise<void> {
  await call<{ ok: boolean }>('/auth/logout', { method: 'POST' }, token).catch(() => undefined);
}
