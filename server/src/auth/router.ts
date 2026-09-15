import { join } from 'node:path';
import { Router } from 'express';
import { hashPassword, verifyPassword } from './passwords';
import { normalizeEmail, UserStore } from './store';
import { issueToken, verifyToken } from './tokens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export interface AuthRouterOptions {
  readonly store?: UserStore;
  readonly root?: string;
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
      res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
      return;
    }
    const user = store.create({
      email,
      displayName,
      passwordHash: await hashPassword(password),
    });
    const token = issueToken({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
    });
    res.status(201).json({
      token,
      user: { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: null },
    });
  });

  router.post('/auth/login', async (req, res) => {
    const email = normalizeEmail(readString(req.body?.email));
    const password = readString(req.body?.password);
    const user = store.findByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: 'Incorrect email or password.' });
      return;
    }
    const token = issueToken({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
    });
    res.json({
      token,
      user: { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: null },
    });
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
