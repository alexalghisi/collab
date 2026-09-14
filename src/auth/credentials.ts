import type { Credentials, SignUpDraft } from './types';

export const MIN_PASSWORD_LENGTH = 8;
/** Long enough for a passphrase, short enough that hashing it is never a lever. */
export const MAX_PASSWORD_LENGTH = 200;
export const MAX_DISPLAY_NAME_LENGTH = 60;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CredentialRejection =
  | 'name-required'
  | 'email-invalid'
  | 'password-short'
  | 'password-long'
  | 'email-taken'
  | 'wrong-credentials';

export const CREDENTIAL_MESSAGES: Record<CredentialRejection, string> = {
  'name-required': 'Enter the name other participants should see.',
  'email-invalid': 'Enter a valid email address.',
  'password-short': `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`,
  'password-long': `Keep the password under ${MAX_PASSWORD_LENGTH} characters.`,
  'email-taken': 'That email already has an account. Sign in instead.',
  'wrong-credentials': 'Wrong email or password.',
};

export type Validated<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: CredentialRejection };

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function normalizeEmail(value: unknown): string {
  return text(value).toLowerCase();
}

export function normalizeDisplayName(value: unknown): string {
  return text(value).replace(/\s+/g, ' ').slice(0, MAX_DISPLAY_NAME_LENGTH);
}

function checkPassword(value: unknown): CredentialRejection | null {
  const password = typeof value === 'string' ? value : '';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return 'password-short';
  }
  return password.length > MAX_PASSWORD_LENGTH ? 'password-long' : null;
}

/**
 * The same rules run in the form and in the router, so the client can say what
 * is wrong without a round trip and the server never takes the client's word.
 */
export function validateSignUp(input: unknown): Validated<SignUpDraft> {
  const draft = (input ?? {}) as Partial<SignUpDraft>;
  const displayName = normalizeDisplayName(draft.displayName);
  const email = normalizeEmail(draft.email);
  if (displayName === '') {
    return { ok: false, reason: 'name-required' };
  }
  if (!EMAIL.test(email)) {
    return { ok: false, reason: 'email-invalid' };
  }
  const badPassword = checkPassword(draft.password);
  if (badPassword) {
    return { ok: false, reason: badPassword };
  }
  return { ok: true, value: { displayName, email, password: draft.password as string } };
}

export function validateCredentials(input: unknown): Validated<Credentials> {
  const credentials = (input ?? {}) as Partial<Credentials>;
  const email = normalizeEmail(credentials.email);
  if (!EMAIL.test(email)) {
    return { ok: false, reason: 'email-invalid' };
  }
  // Signing in has nothing to teach about the password rules: a password that
  // could not have been accepted at sign-up simply does not match an account.
  if (checkPassword(credentials.password)) {
    return { ok: false, reason: 'wrong-credentials' };
  }
  return { ok: true, value: { email, password: credentials.password as string } };
}
