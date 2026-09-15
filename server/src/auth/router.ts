import { join } from 'node:path';
import { Router } from 'express';
import { verifyGoogleAccessToken, verifyGoogleIdToken, type GoogleTokenLookup } from './google';
import { hashPassword, verifyPassword } from './passwords';
import { normalizeEmail, UserStore, type StoredUser } from './store';
import { issueToken, verifyToken } from './tokens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export interface AuthRouterOptions {
  readonly store?: UserStore;
  readonly root?: string;
  readonly googleLookup?: GoogleTokenLookup;
  readonly googleAccessLookup?: GoogleTokenLookup;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function bearer(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : undefined;
}

function sessionBody(user: StoredUser, photoURL: string | null = null) {
  return {
    token: issueToken({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
    }),
    user: {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL,
    },
  };
}

export function authRouter(options: AuthRouterOptions = {}): Router {
  const store =
    options.store ?? new UserStore(join(options.root ?? process.cwd(), 'data', 'users.json'));
  const router = Router();

  router.post('/auth/register', async (req, res) => {
    const email = normalizeEmail(readString(req.body?.email));
    const password = readString(req.body?.password);
    const displayName = readString(req.body?.displayName);
    if (!EMAIL.test(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    if (displayName.length < 2) {
      res.status(400).json({ error: 'Enter the name others will see in the call.' });
      return;
    }
    if (password.length < MIN_PASSWORD) {
      res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
      return;
    }
    if (store.findByEmail(email)) {
      res
        .status(409)
        .json({ error: 'An account with this email already exists. Sign in instead.' });
      return;
    }
    const user = store.create({
      email,
      displayName,
      passwordHash: await hashPassword(password),
    });
    res.status(201).json(sessionBody(user));
  });

  router.post('/auth/login', async (req, res) => {
    const email = normalizeEmail(readString(req.body?.email));
    const password = readString(req.body?.password);
    const user = store.findByEmail(email);
    if (!user?.passwordHash) {
      res.status(401).json({
        error: user ? 'Use Continue with Google for this account.' : 'Incorrect email or password.',
      });
      return;
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: 'Incorrect email or password.' });
      return;
    }
    res.json(sessionBody(user));
  });

  router.post('/auth/google', async (req, res) => {
    const idToken = readString(req.body?.idToken);
    const accessToken = readString(req.body?.accessToken);
    if (!idToken && !accessToken) {
      res.status(400).json({ error: 'Google sign-in did not complete.' });
      return;
    }
    try {
      const profile = idToken
        ? await verifyGoogleIdToken(idToken, options.googleLookup)
        : await verifyGoogleAccessToken(accessToken, options.googleAccessLookup);
      const user = store.linkGoogle({
        email: profile.email,
        displayName: profile.displayName,
        googleSub: profile.sub,
      });
      res.json(sessionBody(user, profile.photoURL));
    } catch (cause) {
      res.status(401).json({
        error: cause instanceof Error ? cause.message : 'Google sign-in failed.',
      });
    }
  });

  router.get('/auth/me', (req, res) => {
    const session = verifyToken(bearer(req.header('authorization')));
    if (!session) {
      res.status(401).json({ error: 'Sign in to continue.' });
      return;
    }
    res.json({
      user: {
        uid: session.uid,
        email: session.email,
        displayName: session.displayName,
        photoURL: null,
      },
    });
  });

  return router;
}
