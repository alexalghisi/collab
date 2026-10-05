import { afterEach, describe, expect, it, vi } from 'vitest';
import { onAppResumed } from './appFocus';

interface FakePage {
  visibilityState: 'visible' | 'hidden';
  readonly listeners: Map<string, Set<() => void>>;
}

function stubPage(): FakePage {
  const listeners = new Map<string, Set<() => void>>();
  const page: FakePage = { visibilityState: 'visible', listeners };
  vi.stubGlobal('document', {
    get visibilityState() {
      return page.visibilityState;
    },
    addEventListener: (event: string, listener: () => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
    },
    removeEventListener: (event: string, listener: () => void) => {
      listeners.get(event)?.delete(listener);
    },
  });
  return page;
}

function fire(page: FakePage, event: string): void {
  for (const listener of [...(page.listeners.get(event) ?? [])]) {
    listener();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('onAppResumed', () => {
  it('calls back when a page that was put away is shown again', () => {
    const page = stubPage();
    const resumed = vi.fn();
    onAppResumed(resumed);

    page.visibilityState = 'hidden';
    fire(page, 'visibilitychange');
    page.visibilityState = 'visible';
    fire(page, 'visibilitychange');

    expect(resumed).toHaveBeenCalledTimes(1);
  });

  it('says nothing while the page is on its way out', () => {
    const page = stubPage();
    const resumed = vi.fn();
    onAppResumed(resumed);

    page.visibilityState = 'hidden';
    fire(page, 'visibilitychange');

    expect(resumed).not.toHaveBeenCalled();
  });

  it('stops listening once the call is over', () => {
    const page = stubPage();
    const resumed = vi.fn();

    onAppResumed(resumed)();
    fire(page, 'visibilitychange');

    expect(resumed).not.toHaveBeenCalled();
  });

  it('does nothing at all where there is no page', () => {
    vi.stubGlobal('document', undefined);

    expect(() => onAppResumed(() => undefined)()).not.toThrow();
  });
});
