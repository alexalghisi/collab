import { useCallback, useEffect, useState } from 'react';
import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { firebaseAuth as firebase } from '../firebase/app';
import { loginAccount, registerAccount, restoreAccount } from './serverAccount';
import { clearSessionToken, readSessionToken, writeSessionToken } from './session';
import type { AuthState, AuthUser, SocialProvider } from './types';

const providerFactories: Record<SocialProvider, () => GoogleAuthProvider | FacebookAuthProvider> = {
  google: () => new GoogleAuthProvider(),
  facebook: () => new FacebookAuthProvider(),
};

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    displayName: user.displayName ?? user.email ?? 'Member',
    email: user.email,
    photoURL: user.photoURL,
  };
}

export function useAuth(): AuthState {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const finish = (next: AuthUser | null) => {
      if (!cancelled) {
        setUser(next);
        setInitializing(false);
      }
    };

    if (firebase) {
      return onAuthStateChanged(firebase, (next) => {
        finish(next ? toAuthUser(next) : null);
      });
    }

    const token = readSessionToken();
    if (!token) {
      finish(null);
      return;
    }
    void restoreAccount(token)
      .then((restored) => finish(restored))
      .catch(() => {
        clearSessionToken();
        finish(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (provider: SocialProvider) => {
    if (!firebase) {
      setError('Social sign-in is not configured on this deployment.');
      return;
    }
    setError(null);
    try {
      await signInWithPopup(firebase, providerFactories[provider]());
    } catch {
      setError('Sign-in failed. Please try again.');
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const session = await loginAccount(email, password);
      writeSessionToken(session.token);
      setUser(session.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed. Please try again.');
    }
  }, []);

  const createAccount = useCallback(
    async (input: { displayName: string; email: string; password: string }) => {
      setError(null);
      try {
        const session = await registerAccount(input);
        writeSessionToken(session.token);
        setUser(session.user);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not create your account. Please try again.',
        );
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    clearSessionToken();
    setUser(null);
    if (firebase) {
      await firebaseSignOut(firebase);
    }
  }, []);

  return {
    initializing,
    user,
    error,
    social: { google: firebase !== null, facebook: firebase !== null },
    signIn,
    signInWithEmail,
    createAccount,
    signOut,
  };
}
