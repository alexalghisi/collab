import { afterEach, describe, expect, it, vi } from 'vitest';
import { timeoutSignal } from './timeoutSignal';

describe('timeoutSignal', () => {
  const original = AbortSignal.timeout;

  afterEach(() => {
    Object.defineProperty(AbortSignal, 'timeout', { value: original, configurable: true });
    vi.useRealTimers();
  });

  it('aborts after the delay when AbortSignal.timeout is missing', () => {
    vi.useFakeTimers();
    Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true });
    const signal = timeoutSignal(1000);
    expect(signal?.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(signal?.aborted).toBe(true);
  });
});
