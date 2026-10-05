/**
 * Fires when the app comes back to the front: a tab made visible again, or a
 * page restored from the back/forward cache.
 *
 * Phones take the camera and the microphone away from whatever is not on
 * screen, so coming back is the moment to find out what is still alive. The
 * native build has its own version of this file on top of `AppState`.
 */
export function onAppResumed(listener: () => void): () => void {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
    return () => undefined;
  }
  const page = document;
  const resumed = (): void => {
    if (page.visibilityState !== 'hidden') {
      listener();
    }
  };
  page.addEventListener('visibilitychange', resumed);
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pageshow', resumed);
  }
  return () => {
    page.removeEventListener('visibilitychange', resumed);
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('pageshow', resumed);
    }
  };
}
