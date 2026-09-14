import { useCallback, useEffect, useState } from 'react';
import { ensureBackendSession, releaseBackendSession } from '../firebase/session';
import { AuthError, fetchSelf, logIn, logOut, signUp } from './api';
import { CREDENTIAL_MESSAGES, validateCredentials, validateSignUp } from './credentials';
import { readStoredSession, writeStoredSession } from './session';
import type { AuthSession, AuthState, Credentials, SignUpDraft } from './types';

/**
 * Signing in against this deployment's own account database. Everybody who can
 * join a meeting has a name and an email here, which is what the directory and
 * the calendar are built on; there is no guest lobby to slip in through.
 */
export function useAuth(): AuthState {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keep = useCallback((next: AuthSession) => {
    writeStoredSession(next);
    setSession(next);
    void ensureBackendSession();
  }, []);

  // A stored token is confirmed with the server before it is trusted, but a
  // server that cannot be reached is not a reason to sign somebody out.
  useEffect(() => {
    const stored = readStoredSession();
    if (!stored) {
      setInitializing(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const account = await fetchSelf(stored.token);
        if (!cancelled) {
          keep({ token: stored.token, account });
        }
      } catch (cause) {
        if (cancelled) {
          return;
        }
        if (cause instanceof AuthError && cause.status !== null) {
          writeStoredSession(null);
        } else {
          keep(stored);
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
  }, [keep]);

  const submit = useCallback(
    async (request: () => Promise<AuthSession>, invalid: string | null) => {
      setError(invalid);
      if (invalid) {
        return;
      }
      setPending(true);
      try {
        keep(await request());
      } catch (cause) {
        setError(cause instanceof AuthError ? cause.message : 'That did not work. Try again.');
      } finally {
        setPending(false);
      }
    },
    [keep],
  );

  const signUpWith = useCallback(
    async (draft: SignUpDraft) => {
      const validated = validateSignUp(draft);
      await submit(
        () => signUp(draft),
        validated.ok ? null : CREDENTIAL_MESSAGES[validated.reason],
      );
    },
    [submit],
  );

  const signInWith = useCallback(
    async (credentials: Credentials) => {
      const validated = validateCredentials(credentials);
      await submit(
        () => logIn(credentials),
        validated.ok ? null : CREDENTIAL_MESSAGES[validated.reason],
      );
    },
    [submit],
  );

  const signOut = useCallback(async () => {
    const token = session?.token;
    writeStoredSession(null);
    setSession(null);
    setError(null);
    await releaseBackendSession();
    if (token) {
      await logOut(token);
    }
  }, [session]);

  return {
    initializing,
    pending,
    session,
    account: session?.account ?? null,
    error,
    signUp: signUpWith,
    signIn: signInWith,
    signOut,
  };
}
