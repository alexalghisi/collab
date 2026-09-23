import { useCallback, useEffect, useState } from 'react';
import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { firebaseAuth as firebase } from '../firebase/app';
import { SIGNALING_URL } from '../signaling/config';
import { isLoopbackSignalingUrl, waitUntilSignalingReady } from '../signaling/wake';
import { loginAccount, loginWithGoogle, registerAccount, restoreAccount } from './serverAccount';
import { requestGoogleCredential } from './googleWeb';
import {
  clearSessionToken,
  readSessionSnapshot,
  restorePersistedSession,
  writeSessionSnapshot,
} from './session';
import type { AuthState, AuthUser, GoogleCredential, SocialProvider } from './types';

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

function firebaseCode(cause: unknown): string | undefined {
  return cause && typeof cause === 'object' && 'code' in cause
    ? String((cause as { code: unknown }).code)
    : undefined;
}

function isRecoverableFirebaseAuthError(cause: unknown): boolean {
  const code = firebaseCode(cause);
  return (
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential' ||
    code === 'auth/invalid-email'
  );
}

async function attachSignalingSession(
  email: string,
  password: string,
  displayName: string,
): Promise<void> {
  try {
    const session = await loginAccount(email, password);
    writeSessionSnapshot(session);
  } catch {
    try {
      const session = await registerAccount({ displayName, email, password });
      writeSessionSnapshot(session);
    } catch {
      return;
    }
  }
}

async function rememberGoogleSession(
  credential: GoogleCredential,
  session: { token: string; user: AuthUser },
): Promise<void> {
  writeSessionSnapshot(session);
  if (!firebase || (!credential.idToken && !credential.accessToken)) {
    return;
  }
  try {
    await signInWithCredential(
      firebase,
      GoogleAuthProvider.credential(credential.idToken, credential.accessToken),
    );
  } catch {
    return;
  }
}

export function useAuth(): AuthState {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoopbackSignalingUrl(SIGNALING_URL)) {
      void waitUntilSignalingReady(SIGNALING_URL).catch(() => undefined);
    }
    let cancelled = false;
    const snapshot = readSessionSnapshot();
    if (snapshot?.user) {
      setUser(snapshot.user);
      setInitializing(false);
    }

    const applyRestored = (restored: AuthUser | null, firebaseUser: AuthUser | null) => {
      if (cancelled) {
        return;
      }
      if (restored) {
        setUser(restored);
      } else if (!firebaseUser) {
        setUser(null);
      }
      setInitializing(false);
    };

    if (firebase) {
      return onAuthStateChanged(firebase, (next) => {
        const firebaseUser = next ? toAuthUser(next) : null;
        if (firebaseUser && !cancelled) {
          setUser(firebaseUser);
          setInitializing(false);
        }
        void restorePersistedSession(restoreAccount).then((restored) => {
          applyRestored(restored, firebaseUser);
        });
      });
    }

    void restorePersistedSession(restoreAccount).then((restored) => {
      applyRestored(restored, null);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (provider: SocialProvider) => {
    if (provider === 'google') {
      setError(null);
      try {
        const credential = await requestGoogleCredential();
        const session = await loginWithGoogle(credential);
        await rememberGoogleSession(credential, session);
        setUser(session.user);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Google sign-in failed. Please try again.',
        );
      }
      return;
    }
    if (!firebase) {
      setError('Facebook sign-in is not configured on this deployment.');
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
      if (firebase) {
        try {
          const cred = await signInWithEmailAndPassword(firebase, email, password);
          await attachSignalingSession(email, password, cred.user.displayName ?? email);
          setUser(toAuthUser(cred.user));
          return;
        } catch (cause) {
          if (!isRecoverableFirebaseAuthError(cause)) {
            throw cause;
          }
        }
      }
      const session = await loginAccount(email, password);
      writeSessionSnapshot(session);
      setUser(session.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed. Please try again.');
    }
  }, []);

  const createAccount = useCallback(
    async (input: { displayName: string; email: string; password: string }) => {
      setError(null);
      try {
        if (firebase) {
          try {
            const cred = await createUserWithEmailAndPassword(
              firebase,
              input.email,
              input.password,
            );
            await updateProfile(cred.user, { displayName: input.displayName });
            await attachSignalingSession(input.email, input.password, input.displayName);
            setUser({
              ...toAuthUser(cred.user),
              displayName: input.displayName,
            });
            return;
          } catch (cause) {
            if (!isRecoverableFirebaseAuthError(cause)) {
              throw cause;
            }
          }
        }
        const session = await registerAccount(input);
        writeSessionSnapshot(session);
        setUser(session.user);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not create your account. Please try again.',
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
    social: { google: true, facebook: firebase !== null },
    signIn,
    signInWithEmail,
    createAccount,
    signOut,
  };
}
