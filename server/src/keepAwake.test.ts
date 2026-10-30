import { afterEach, describe, expect, it, vi } from 'vitest';
import { startKeepAwake } from './keepAwake';

describe('startKeepAwake', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing without a public URL', () => {
    expect(startKeepAwake(undefined)).toBeNull();
  });

  it('pings the public health URL on an interval', () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('ok')));
    const stop = startKeepAwake('https://collab.example.com/', fetchImpl as never, 1000);
    vi.advanceTimersByTime(2500);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]).toEqual([
      'https://collab.example.com/health',
      { cache: 'no-store' },
    ]);
    stop?.();
    vi.advanceTimersByTime(5000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
