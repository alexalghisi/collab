export interface AuthUser {
  readonly uid: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly photoURL: string | null;
}

export type SocialProvider = 'google' | 'facebook';

export interface GoogleCredential {
  readonly idToken?: string;
  readonly accessToken?: string;
}

export interface AuthState {
  readonly initializing: boolean;
  readonly user: AuthUser | null;
  readonly error: string | null;
  readonly social: { readonly google: boolean; readonly facebook: boolean };
  signIn: (provider: SocialProvider) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  createAccount: (input: { displayName: string; email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
}
