import { Router, type Request, type Response } from 'express';
import { RateLimiter } from '../execution/RateLimiter';
import { AccountError, type Account, type AccountStore } from './AccountStore';

export interface AccountRouterOptions {
  readonly store: AccountStore;
  readonly limiter?: RateLimiter;
}

/** Guessing passwords is the attack this door has; a burst of tries is all anyone gets. */
const DEFAULT_LIMITER = () => new RateLimiter({ burst: 10, refillMs: 30_000 });

const field = (request: Request, name: string): string => {
  const value = (request.body as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : '';
};

function bearerToken(request: Request): string {
  const header = request.header('authorization') ?? '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

function fail(response: Response, cause: unknown): void {
  if (cause instanceof AccountError) {
    response.status(cause.status).json({ error: cause.message });
    return;
  }
  response.status(500).json({ error: 'The account service is unavailable.' });
}

/**
 * Sign-up, sign-in and the people directory, all against the server's own
 * local account database. Everything past the front door needs the bearer
 * token the first two hand out.
 */
export function accountRouter({
  store,
  limiter = DEFAULT_LIMITER(),
}: AccountRouterOptions): Router {
  const router = Router();

  const authenticate = (request: Request, response: Response): Account | null => {
    const account = store.accountFor(bearerToken(request));
    if (!account) {
      response.status(401).json({ error: 'Sign in to continue.' });
      return null;
    }
    return account;
  };

  const spend = (request: Request, response: Response, action: string): boolean => {
    const keys = [
      `${action}:ip:${request.ip ?? 'unknown'}`,
      `${action}:${field(request, 'email')}`,
    ];
    if (limiter.take(keys)) {
      return true;
    }
    response.status(429).json({ error: 'Too many attempts. Wait a moment and try again.' });
    return false;
  };

  router.post('/auth/signup', (request, response) => {
    if (!spend(request, response, 'signup')) {
      return;
    }
    try {
      const session = store.signUp({
        name: field(request, 'name'),
        email: field(request, 'email'),
        password: field(request, 'password'),
      });
      response.status(201).json(session);
    } catch (cause) {
      fail(response, cause);
    }
  });

  router.post('/auth/login', (request, response) => {
    if (!spend(request, response, 'login')) {
      return;
    }
    try {
      response.json(
        store.signIn({ email: field(request, 'email'), password: field(request, 'password') }),
      );
    } catch (cause) {
      fail(response, cause);
    }
  });

  router.post('/auth/logout', (request, response) => {
    store.signOut(bearerToken(request));
    response.json({ ok: true });
  });

  router.get('/auth/me', (request, response) => {
    const account = authenticate(request, response);
    if (account) {
      response.json({ account });
    }
  });

  router.get('/auth/directory', (request, response) => {
    if (authenticate(request, response)) {
      response.json({ people: store.directory() });
    }
  });

  return router;
}
