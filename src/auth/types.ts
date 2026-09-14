import type { Credentials, SignUpRequest } from './accounts';

export interface AuthUser {
  readonly uid: string;
  readonly displayName: string;
  readonly email: string;
}

export interface AuthState {
  /** True while a stored token is being checked against the server. */
  readonly initializing: boolean;
  readonly user: AuthUser | null;
  /** Bearer token for the account endpoints; null when signed out. */
  readonly token: string | null;
  readonly error: string | null;
  /** True while a sign-in or sign-up request is in flight. */
  readonly pending: boolean;
  signIn: (credentials: Credentials) => Promise<void>;
  signUp: (request: SignUpRequest) => Promise<void>;
  signOut: () => Promise<void>;
}
