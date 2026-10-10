import type { Request, Response } from 'express';

export const DEFAULT_APP_URL = 'https://alexalghisi.github.io/collab';

export function publicAppUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.PUBLIC_APP_URL?.trim() || env.EXPO_PUBLIC_APP_URL?.trim() || DEFAULT_APP_URL;
  return raw.replace(/\/$/, '');
}

export function sendAppHome(_request: Request, response: Response): void {
  response.redirect(302, publicAppUrl());
}

export function signalingHealth(sandbox: string) {
  return {
    status: 'ok' as const,
    service: 'collab-signaling',
    sandbox,
    directory: true,
  };
}
