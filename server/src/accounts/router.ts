import { Router, type Request, type Response } from 'express';
import { CREDENTIAL_MESSAGES, type CredentialRejection } from '../../../src/auth/credentials';
import type { Account } from '../../../src/auth/types';
import { RateLimiter } from '../execution/RateLimiter';
import type { AccountStore } from './AccountStore';

const REJECTION_STATUS: Record<CredentialRejection, number> = {
  'name-required': 400,
  'email-invalid': 400,
  'password-short': 400,
  'password-long': 400,
  'email-taken': 409,
  'wrong-credentials': 401,
};

export interface AccountsRouterOptions {
  readonly store: AccountStore;
  readonly limiter?: RateLimiter;
}

/** Ten attempts in a burst, one more every five seconds, per client address. */
const DEFAULT_LIMITER = () => new RateLimiter({ burst: 10, refillMs: 5_000 });

const TOO_MANY = 'Too many attempts in a row — wait a moment and try again.';
const NO_SESSION = 'Sign in to continue.';

/** The bearer token of the caller, or an empty string when there is none. */
export function bearerToken(request: Request): string {
  const header = request.headers.authorization;
  return typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : '';
}

/** Resolves the caller's account, or answers 401 and returns null. */
export function requireAccount(
  store: AccountStore,
  request: Request,
  response: Response,
): Account | null {
  const account = store.accountForToken(bearerToken(request));
  if (!account) {
    response.status(401).json({ error: NO_SESSION });
    return null;
  }
  return account;
}

/**
 * Sign-up, sign-in and the directory of names, served from the deployment's own
 * database. The directory needs a session of its own: who works here is not
 * something an anonymous caller gets to enumerate.
 */
export function accountsRouter({
  store,
  limiter = DEFAULT_LIMITER(),
}: AccountsRouterOptions): Router {
  const router = Router();

  const attempt = (
    request: Request,
    response: Response,
    run: () => ReturnType<AccountStore['logIn']>,
    createdStatus: number,
  ): void => {
    if (!limiter.take([`client:${request.ip ?? 'unknown'}`])) {
      response.status(429).json({ error: TOO_MANY });
      return;
    }
    const result = run();
    if (!result.ok) {
      response.status(REJECTION_STATUS[result.reason]).json({
        error: CREDENTIAL_MESSAGES[result.reason],
        reason: result.reason,
      });
      return;
    }
    response.status(createdStatus).json(result.session);
  };

  router.post('/accounts/signup', (request, response) => {
    attempt(request, response, () => store.signUp(request.body), 201);
  });

  router.post('/accounts/login', (request, response) => {
    attempt(request, response, () => store.logIn(request.body), 200);
  });

  router.post('/accounts/logout', (request, response) => {
    store.logOut(bearerToken(request));
    response.status(204).end();
  });

  router.get('/accounts/me', (request, response) => {
    const account = requireAccount(store, request, response);
    if (account) {
      response.json({ account });
    }
  });

  router.get('/accounts', (request, response) => {
    if (requireAccount(store, request, response)) {
      response.json({ accounts: store.directory() });
    }
  });

  return router;
}
