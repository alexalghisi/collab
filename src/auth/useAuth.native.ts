import { useCallback, useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import type { AuthSessionResult } from 'expo-auth-session';
import { readNativeAuthConfig } from './config';
import type { AuthState, AuthUser, SocialProvider } from './types';

// Finalises the auth session when the app is reopened from the browser redirect.
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
    displayName: profile.name ?? profile.email ?? 'Guest',
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
    displayName: profile.name ?? profile.email ?? 'Guest',
    email: profile.email ?? null,
    photoURL: profile.picture?.data?.url ?? null,
  };
}

export function useAuth(): AuthState {
  const enabled = config !== null;
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

  const resolve = useCallback(
    async (result: AuthSessionResult | null, fetchUser: (token: string) => Promise<AuthUser>) => {
      if (!result || result.type === 'cancel' || result.type === 'dismiss') {
        return;
      }
      const accessToken = result.type === 'success' ? result.authentication?.accessToken : null;
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

  const signOut = useCallback(async () => {
    setUser(null);
  }, []);

  return { enabled, initializing: false, user, error, signIn, signOut };
}
