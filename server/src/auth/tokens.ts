import { createHmac, timingSafeEqual } from 'node:crypto';

export interface AuthToken {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : 'collab-dev-auth-secret';
}

export function issueToken(user: AuthToken, ttlMs = MONTH_MS): string {
  const payload = Buffer.from(
    JSON.stringify({ ...user, exp: Date.now() + ttlMs }),
    'utf8',
  ).toString('base64url');
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyToken(token: string | undefined | null): AuthToken | null {
  if (!token) {
    return null;
  }
  const dot = token.lastIndexOf('.');
  if (dot <= 0) {
    return null;
  }
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: unknown;
      email?: unknown;
      displayName?: unknown;
      exp?: unknown;
    };
    if (typeof data.exp !== 'number' || data.exp < Date.now()) {
      return null;
    }
    if (
      typeof data.uid !== 'string' ||
      typeof data.email !== 'string' ||
      typeof data.displayName !== 'string'
    ) {
      return null;
    }
    return { uid: data.uid, email: data.email, displayName: data.displayName };
  } catch {
    return null;
  }
}
