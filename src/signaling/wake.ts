import { SignalingUnavailableError } from './SignalingChannel';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const REMOTE_WAKE_MS = 75_000;

export interface WakeOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  pauseMs?: number;
  probeTimeoutMs?: number;
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
  const timeoutMs = options.timeoutMs ?? REMOTE_WAKE_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SignalingUnavailableError(url)), timeoutMs);
  });
  const polling = pollHealth(url, options);
  void polling.catch(() => undefined);
  try {
    await Promise.race([polling, expired]);
  } finally {
    clearTimeout(timer);
  }
}

async function pollHealth(url: string, options: WakeOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? REMOTE_WAKE_MS;
  const pauseMs = options.pauseMs ?? 1_000;
  const probeTimeoutMs = options.probeTimeoutMs ?? 4_000;
  const deadline = Date.now() + timeoutMs;
  const health = `${url.replace(/\/$/, '')}/health`;
  for (;;) {
    let ready: boolean;
    try {
      ready = (
        await fetchImpl(health, {
          cache: 'no-store',
          signal: AbortSignal.timeout(probeTimeoutMs),
        })
      ).ok;
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
