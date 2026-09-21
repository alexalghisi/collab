import { SignalingUnavailableError } from './SignalingChannel';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export interface WakeOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  pauseMs?: number;
}

export function isLoopbackSignalingUrl(url: string): boolean {
  try {
    return LOOPBACK.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitUntilSignalingReady(
  url: string,
  options: WakeOptions = {},
): Promise<void> {
  if (isLoopbackSignalingUrl(url)) {
    return;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 45_000;
  const pauseMs = options.pauseMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  const health = `${url.replace(/\/$/, '')}/health`;
  for (;;) {
    let ready: boolean;
    try {
      ready = (await fetchImpl(health, { cache: 'no-store' })).ok;
    } catch {
      ready = false;
    }
    if (ready) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new SignalingUnavailableError(url);
    }
    await pause(pauseMs);
  }
}
