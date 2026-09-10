import { useCallback, useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { readFirebaseConfig } from './config';
import type { AuthState, AuthUser, SocialProvider } from './types';

const config = readFirebaseConfig();
const auth: Auth | null = config ? getAuth(initializeApp(config)) : null;

const providerFactories: Record<SocialProvider, () => GoogleAuthProvider | FacebookAuthProvider> = {
  google: () => new GoogleAuthProvider(),
  facebook: () => new FacebookAuthProvider(),
};

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    displayName: user.displayName ?? user.email ?? 'Guest',
    email: user.email,
    photoURL: user.photoURL,
  };
}

export function useAuth(): AuthState {
  const enabled = auth !== null;
  const [initializing, setInitializing] = useState(enabled);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      return;
    }
    return onAuthStateChanged(auth, (next) => {
      setUser(next ? toAuthUser(next) : null);
      setInitializing(false);
    });
  }, []);

  const signIn = useCallback(async (provider: SocialProvider) => {
    if (!auth) {
      return;
    }
    setError(null);
    try {
      await signInWithPopup(auth, providerFactories[provider]());
    } catch {
      setError('Sign-in failed. Please try again.');
    }
  }, []);

  const signOut = useCallback(async () => {
    if (auth) {
      await firebaseSignOut(auth);
    }
  }, []);

  return { enabled, initializing, user, error, signIn, signOut };
}
