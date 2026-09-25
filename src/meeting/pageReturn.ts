export interface PageSignalTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  visibilityState?: string;
}

/**
 * Fires when the page is on screen again: the tab was brought forward, the
 * window was focused, or the browser restored it from the back-forward cache.
 * Hidden tabs throttle timers, so a poll alone can miss an edit made elsewhere.
 */
export function subscribeToPageReturn(
  onReturn: () => void,
  documentRef?: PageSignalTarget | null,
  windowRef?: PageSignalTarget | null,
): () => void {
  if (!documentRef?.addEventListener || !windowRef?.addEventListener) {
    return () => undefined;
  }
  const onVisibility = () => {
    if (documentRef.visibilityState === 'visible') {
      onReturn();
    }
  };
  const onShow = () => onReturn();
  documentRef.addEventListener('visibilitychange', onVisibility);
  windowRef.addEventListener('focus', onShow);
  windowRef.addEventListener('pageshow', onShow);
  return () => {
    documentRef.removeEventListener('visibilitychange', onVisibility);
    windowRef.removeEventListener('focus', onShow);
    windowRef.removeEventListener('pageshow', onShow);
  };
}
