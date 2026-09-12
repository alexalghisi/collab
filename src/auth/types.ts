export interface AuthUser {
  readonly uid: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly photoURL: string | null;
}

export type SocialProvider = 'google' | 'facebook';

export interface AuthState {
  readonly enabled: boolean;
  readonly initializing: boolean;
  readonly user: AuthUser | null;
  readonly error: string | null;
  signIn: (provider: SocialProvider) => Promise<void>;
  signOut: () => Promise<void>;
}
