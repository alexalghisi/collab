import { describe, expect, it } from 'vitest';
import { RateLimiter } from './RateLimiter';

describe('RateLimiter', () => {
  const limiterAt = (clock: { now: number }) =>
    new RateLimiter({ burst: 3, refillMs: 1000 }, () => clock.now);

  it('allows a burst and then refuses', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock);

    expect([1, 2, 3].map(() => limiter.take(['peer']))).toEqual([true, true, true]);
    expect(limiter.take(['peer'])).toBe(false);
  });

  it('earns one run back per refill interval', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock);
    while (limiter.take(['peer'])) {
      /* drain */
    }

    clock.now = 999;
    expect(limiter.take(['peer'])).toBe(false);
    clock.now = 1000;
    expect(limiter.take(['peer'])).toBe(true);
    expect(limiter.take(['peer'])).toBe(false);
  });

  it('never earns back more than a full burst', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock);
    limiter.take(['peer']);

    clock.now = 60_000;

    expect([1, 2, 3].map(() => limiter.take(['peer']))).toEqual([true, true, true]);
    expect(limiter.take(['peer'])).toBe(false);
  });

  it('keeps separate allowances per key', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock);
    while (limiter.take(['peer:a'])) {
      /* drain */
    }

    expect(limiter.take(['peer:b'])).toBe(true);
  });

  it('spends nothing when one of the keys is exhausted', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock);
    while (limiter.take(['room'])) {
      /* drain the room, not the peer */
    }

    expect(limiter.take(['room', 'peer'])).toBe(false);
    expect(limiter.take(['peer'])).toBe(true);
  });

  it('forgets a key so a finished room stops taking memory', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock);
    while (limiter.take(['room'])) {
      /* drain */
    }

    limiter.forget('room');

    expect(limiter.take(['room'])).toBe(true);
  });
});
