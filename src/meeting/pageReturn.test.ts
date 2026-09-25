import { describe, expect, it, vi } from 'vitest';
import { subscribeToPageReturn, type PageSignalTarget } from './pageReturn';

function signals(): PageSignalTarget & {
  emit(type: string): void;
} {
  const listeners = new Map<string, Set<() => void>>();
  return {
    visibilityState: 'hidden',
    addEventListener(type, listener) {
      const group = listeners.get(type) ?? new Set();
      group.add(listener);
      listeners.set(type, group);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type) {
      for (const listener of listeners.get(type) ?? []) {
        listener();
      }
    },
  };
}

describe('subscribeToPageReturn', () => {
  it('syncs when the tab becomes visible again and ignores a hidden change', () => {
    const documentRef = signals();
    const windowRef = signals();
    const onReturn = vi.fn();

    subscribeToPageReturn(onReturn, documentRef, windowRef);
    documentRef.visibilityState = 'hidden';
    documentRef.emit('visibilitychange');
    expect(onReturn).not.toHaveBeenCalled();

    documentRef.visibilityState = 'visible';
    documentRef.emit('visibilitychange');
    expect(onReturn).toHaveBeenCalledOnce();
  });

  it('syncs when the window is focused and stops after unsubscribe', () => {
    const documentRef = signals();
    const windowRef = signals();
    const onReturn = vi.fn();
    const stop = subscribeToPageReturn(onReturn, documentRef, windowRef);

    windowRef.emit('focus');
    windowRef.emit('pageshow');
    expect(onReturn).toHaveBeenCalledTimes(2);

    stop();
    windowRef.emit('focus');
    expect(onReturn).toHaveBeenCalledTimes(2);
  });

  it('does nothing where there is no page', () => {
    expect(subscribeToPageReturn(() => undefined, null, null)).not.toThrow();
  });
});
