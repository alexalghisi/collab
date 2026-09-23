import { useCallback, useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import type { AuthSessionResult } from 'expo-auth-session';
import { SIGNALING_URL } from '../signaling/config';
import { isLoopbackSignalingUrl, waitUntilSignalingReady } from '../signaling/wake';
import { readNativeAuthConfig } from './config';
import { loginAccount, loginWithGoogle, registerAccount, restoreAccount } from './serverAccount';
import {
  clearSessionToken,
  readSessionSnapshot,
  restorePersistedSession,
  writeSessionSnapshot,
} from './session';
import type { AuthState, AuthUser, SocialProvider } from './types';

WebBrowser.maybeCompleteAuthSession();

const config = readNativeAuthConfig();
const SIGN_IN_ERROR = 'Sign-in failed. Please try again.';

async function fetchGoogleUser(accessToken: string): Promise<AuthUser> {
  const response = await fetch('https://www.googleapis.com/userinfo/v2/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await response.json();
  return {
    uid: profile.id,
    displayName: profile.name ?? profile.email ?? 'Member',
    email: profile.email ?? null,
    photoURL: profile.picture ?? null,
  };
}

async function fetchFacebookUser(accessToken: string): Promise<AuthUser> {
  const response = await fetch(
    `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${accessToken}`,
  );
  const profile = await response.json();
  return {
    uid: profile.id,
    displayName: profile.name ?? profile.email ?? 'Member',
    email: profile.email ?? null,
    photoURL: profile.picture?.data?.url ?? null,
  };
}

export function useAuth(): AuthState {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [, googleResponse, promptGoogle] = Google.useAuthRequest({
    webClientId: config?.google?.webClientId,
    iosClientId: config?.google?.iosClientId,
    androidClientId: config?.google?.androidClientId,
  });
  const [, facebookResponse, promptFacebook] = Facebook.useAuthRequest({
    clientId: config?.facebookAppId ?? undefined,
  });

  useEffect(() => {
    if (!isLoopbackSignalingUrl(SIGNALING_URL)) {
      void waitUntilSignalingReady(SIGNALING_URL).catch(() => undefined);
    }
    let cancelled = false;
    void (async () => {
      const snapshot = await readSessionSnapshot();
      if (cancelled) {
        return;
      }
      if (snapshot?.user) {
        setUser(snapshot.user);
        setInitializing(false);
      }
      try {
        const restored = await restorePersistedSession(restoreAccount);
        if (!cancelled) {
          setUser(restored);
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolve = useCallback(
    async (result: AuthSessionResult | null, fetchUser: (token: string) => Promise<AuthUser>) => {
      if (!result || result.type === 'cancel' || result.type === 'dismiss') {
        return;
      }
      const authentication = result.type === 'success' ? result.authentication : null;
      const idToken = authentication?.idToken;
      const accessToken = authentication?.accessToken;
      if (idToken) {
        try {
          const session = await loginWithGoogle({ idToken });
          await writeSessionSnapshot(session);
          setUser(session.user);
          setError(null);
        } catch {
          setError(SIGN_IN_ERROR);
        }
        return;
      }
      if (accessToken && fetchUser === fetchGoogleUser) {
        try {
          const session = await loginWithGoogle({ accessToken });
          await writeSessionSnapshot(session);
          setUser(session.user);
          setError(null);
        } catch {
          setError(SIGN_IN_ERROR);
        }
        return;
      }
      if (!accessToken) {
        setError(SIGN_IN_ERROR);
        return;
      }
      try {
        setUser(await fetchUser(accessToken));
        setError(null);
      } catch {
        setError(SIGN_IN_ERROR);
      }
    },
    [],
  );

  useEffect(() => {
    void resolve(googleResponse, fetchGoogleUser);
  }, [googleResponse, resolve]);

  useEffect(() => {
    void resolve(facebookResponse, fetchFacebookUser);
  }, [facebookResponse, resolve]);

  const signIn = useCallback(
    async (provider: SocialProvider) => {
      setError(null);
      await (provider === 'google' ? promptGoogle() : promptFacebook());
    },
    [promptGoogle, promptFacebook],
  );

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const session = await loginAccount(email, password);
      await writeSessionSnapshot(session);
      setUser(session.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : SIGN_IN_ERROR);
    }
  }, []);

  const createAccount = useCallback(
    async (input: { displayName: string; email: string; password: string }) => {
      setError(null);
      try {
        const session = await registerAccount(input);
        await writeSessionSnapshot(session);
        setUser(session.user);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not create your account.');
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    await clearSessionToken();
    setUser(null);
  }, []);

  return {
    initializing,
    user,
    error,
    social: { google: Boolean(config?.google), facebook: Boolean(config?.facebookAppId) },
    signIn,
    signInWithEmail,
    createAccount,
    signOut,
  };
}
