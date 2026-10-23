/**
 * `AbortSignal.timeout` is missing on iOS Safari before 16 and older Android
 * browsers; calling it there throws, which surfaced as "could not reach the
 * account service" before any request went out.
 */
export function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  if (typeof AbortController === 'undefined') {
    return undefined;
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
