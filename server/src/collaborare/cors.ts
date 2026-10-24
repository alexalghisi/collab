import type { NextFunction, Request, Response } from 'express';

const PAGES_ORIGIN = 'https://alexalghisi.github.io';

/** Origins allowed to call the problem catalog from a browser. */
export function isProblemsApiOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }
  if (origin === PAGES_ORIGIN) {
    return true;
  }
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:') {
    return false;
  }
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

/**
 * CORS for `/api/problems` only. The rest of the server keeps its own policy.
 * A matching browser origin is echoed back; every other origin gets no
 * allow-origin header, including a wildcard set by an earlier middleware.
 */
export function problemsCors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.header('origin');
  res.removeHeader('Access-Control-Allow-Origin');
  if (origin && isProblemsApiOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.status(origin && isProblemsApiOrigin(origin) ? 204 : 403).end();
    return;
  }
  next();
}
