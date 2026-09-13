export interface RateLimitOptions {
  /** Runs allowed in a burst before the bucket has to refill. */
  readonly burst: number;
  /** Milliseconds it takes to earn one more run. */
  readonly refillMs: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * Token bucket keyed by room and by participant, so one impatient participant
 * cannot spend the room's whole allowance and a busy room cannot spend the
 * server's. Enforced here rather than in the UI: the client is not trusted.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly options: RateLimitOptions,
    private readonly now: () => number = Date.now,
  ) {}

  /** Consumes one token from every key, or none at all if any is exhausted. */
  take(keys: string[]): boolean {
    const buckets = keys.map((key) => this.bucketOf(key));
    if (buckets.some((bucket) => bucket.tokens < 1)) {
      return false;
    }
    for (const bucket of buckets) {
      bucket.tokens -= 1;
    }
    return true;
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }

  private bucketOf(key: string): Bucket {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.options.burst, updatedAt: now };
    const earned = (now - bucket.updatedAt) / this.options.refillMs;
    bucket.tokens = Math.min(this.options.burst, bucket.tokens + earned);
    bucket.updatedAt = now;
    this.buckets.set(key, bucket);
    return bucket;
  }
}
