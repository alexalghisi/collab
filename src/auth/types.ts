/** Somebody with an account on this deployment. */
export interface Account {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly createdAt: number;
}

export interface SignUpDraft {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
}

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

/** What the client keeps between launches: the account and its bearer token. */
export interface AuthSession {
  readonly token: string;
  readonly account: Account;
}

export interface AuthState {
  /** True while a stored session is being checked against the server. */
  readonly initializing: boolean;
  /** True while a sign-in or sign-up request is in flight. */
  readonly pending: boolean;
  readonly session: AuthSession | null;
  readonly account: Account | null;
  readonly error: string | null;
  signUp: (draft: SignUpDraft) => Promise<void>;
  signIn: (credentials: Credentials) => Promise<void>;
  signOut: () => Promise<void>;
}
