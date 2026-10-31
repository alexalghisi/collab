import { timeoutSignal } from '../net/timeoutSignal';
import { SignalingUnavailableError } from './SignalingChannel';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const REMOTE_WAKE_MS = 120_000;

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

/** One wake-up per server at a time: joining and sign-in share the same wait. */
const inFlight = new Map<string, Promise<void>>();

export function waitUntilSignalingReady(url: string, options: WakeOptions = {}): Promise<void> {
  if (isLoopbackSignalingUrl(url)) {
    return Promise.resolve();
  }
  // Injected fetches (tests) and custom timings always run their own wait.
  if (Object.keys(options).length > 0) {
    return wake(url, options);
  }
  const pending = inFlight.get(url);
  if (pending) {
    return pending;
  }
  const started = wake(url, options).finally(() => inFlight.delete(url));
  inFlight.set(url, started);
  return started;
}

async function wake(url: string, options: WakeOptions): Promise<void> {
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
  const probeTimeoutMs = options.probeTimeoutMs ?? timeoutMs;
  const deadline = Date.now() + timeoutMs;
  const health = `${url.replace(/\/$/, '')}/health`;
  for (;;) {
    let ready: boolean;
    try {
      ready = (
        await fetchImpl(health, {
          cache: 'no-store',
          signal: timeoutSignal(probeTimeoutMs),
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
