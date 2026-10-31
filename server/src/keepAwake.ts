/**
 * Render's free plan stops a web service after 15 minutes without inbound
 * requests, and the next caller waits about a minute for it to boot. GitHub's
 * scheduled workflow is throttled to one run every few hours, so it cannot
 * bridge that gap. The service pings its own public URL instead: the request
 * goes out through Render's edge, so it counts as inbound traffic.
 */
export const KEEP_AWAKE_MS = 10 * 60 * 1000;

export function startKeepAwake(
  publicUrl: string | undefined,
  fetchImpl: typeof fetch = fetch,
  everyMs = KEEP_AWAKE_MS,
): (() => void) | null {
  if (!publicUrl) {
    return null;
  }
  const health = `${publicUrl.replace(/\/$/, '')}/health`;
  const timer = setInterval(() => {
    void fetchImpl(health, { cache: 'no-store' }).catch((cause: unknown) => {
      console.info('[keep-awake] ping failed', cause);
    });
  }, everyMs);
  // Never hold the process open just to ping itself.
  (timer as { unref?: () => void }).unref?.();
  return () => clearInterval(timer);
}
