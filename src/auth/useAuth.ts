import { useCallback, useEffect, useState } from 'react';
import { storage } from '../storage/keyValue';
import {
  AuthError,
  fetchAccount,
  forgetSession,
  requestSignIn,
  requestSignUp,
  type Account,
  type AccountSession,
  type Credentials,
  type SignUpRequest,
} from './accounts';
import type { AuthState, AuthUser } from './types';

const TOKEN_KEY = 'collab.auth.token';

const toAuthUser = (account: Account): AuthUser => ({
  uid: account.id,
  displayName: account.name,
  email: account.email,
});

/**
 * Signing in is the way into the app: every meeting, scheduled or instant, is
 * attached to a real account, which is what lets the calendar say who is
 * invited. The session token is kept locally and checked against the server on
 * every start, so an account deleted there cannot come back from a stale token.
 */
export function useAuth(): AuthState {
  const [session, setSession] = useState<{ token: string; user: AuthUser } | null>(null);
  const [initializing, setInitializing] = useState(() => storage.read(TOKEN_KEY) !== null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = storage.read(TOKEN_KEY);
    if (!stored) {
      return;
    }
    let live = true;
    void (async () => {
      try {
        const account = await fetchAccount(stored);
        if (live) {
          setSession({ token: stored, user: toAuthUser(account) });
        }
      } catch (cause) {
        // A token the server rejected is spent; one it could not answer for
        // (server down, no network) is kept so a reload can pick it up again.
        if (cause instanceof AuthError && cause.status === 401) {
          storage.remove(TOKEN_KEY);
        } else if (live) {
          setError((cause as Error).message);
        }
      } finally {
        if (live) {
          setInitializing(false);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const enter = useCallback(async (request: () => Promise<AccountSession>) => {
    setError(null);
    setPending(true);
    try {
      const { account, token } = await request();
      storage.write(TOKEN_KEY, token);
      setSession({ token, user: toAuthUser(account) });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }, []);

  const signIn = useCallback(
    (credentials: Credentials) => enter(() => requestSignIn(credentials)),
    [enter],
  );

  const signUp = useCallback(
    (request: SignUpRequest) => enter(() => requestSignUp(request)),
    [enter],
  );

  const signOut = useCallback(async () => {
    const token = session?.token;
    storage.remove(TOKEN_KEY);
    setSession(null);
    setError(null);
    if (token) {
      await forgetSession(token);
    }
  }, [session]);

  return {
    initializing,
    user: session?.user ?? null,
    token: session?.token ?? null,
    error,
    pending,
    signIn,
    signUp,
    signOut,
  };
}
