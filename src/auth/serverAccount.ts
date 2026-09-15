import { SIGNALING_URL } from '../signaling/config';
import type { AuthUser, GoogleCredential } from './types';

export interface AuthSession {
  readonly token: string;
  readonly user: AuthUser;
}

interface AuthResponseBody {
  readonly token?: unknown;
  readonly user?: {
    uid?: unknown;
    displayName?: unknown;
    email?: unknown;
    photoURL?: unknown;
  };
  readonly error?: unknown;
}

function toUser(body: AuthResponseBody['user']): AuthUser | null {
  if (!body || typeof body.uid !== 'string' || typeof body.displayName !== 'string') {
    return null;
  }
  return {
    uid: body.uid,
    displayName: body.displayName,
    email: typeof body.email === 'string' ? body.email : null,
    photoURL: typeof body.photoURL === 'string' ? body.photoURL : null,
  };
}

async function request(path: string, init?: RequestInit): Promise<AuthSession> {
  let response: Response;
  try {
    response = await fetch(`${SIGNALING_URL}${path}`, init);
  } catch {
    throw new Error('Could not reach the account service. Try again in a moment.');
  }
  const body = (await response.json().catch(() => ({}))) as AuthResponseBody;
  if (!response.ok) {
    throw new Error(
      typeof body.error === 'string' ? body.error : 'Could not complete that request.',
    );
  }
  const user = toUser(body.user);
  if (typeof body.token !== 'string' || !user) {
    throw new Error('The account service returned an unexpected response.');
  }
  return { token: body.token, user };
}

export async function registerAccount(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<AuthSession> {
  return request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function loginAccount(email: string, password: string): Promise<AuthSession> {
  return request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function loginWithGoogle(credential: GoogleCredential): Promise<AuthSession> {
  return request('/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credential),
  });
}

export async function restoreAccount(token: string): Promise<AuthUser> {
  let response: Response;
  try {
    response = await fetch(`${SIGNALING_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error('Could not restore your session.');
  }
  if (!response.ok) {
    throw new Error('Sign in to continue.');
  }
  const body = (await response.json()) as AuthResponseBody;
  const user = toUser(body.user);
  if (!user) {
    throw new Error('Sign in to continue.');
  }
  return user;
}
