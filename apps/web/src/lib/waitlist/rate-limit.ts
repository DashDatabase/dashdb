// In-memory sliding-window rate limits for the waitlist form. Per process: enough to stop a
// single client hammering one server; a multi-instance deployment should move this to Redis.

export interface RateLimiterOptions {
  /** Requests allowed per key within `windowMs`. */
  readonly limit: number;
  readonly windowMs: number;
  /** Keys tracked at once; the least recently used is dropped beyond this, bounding memory. */
  readonly maxKeys?: number;
  readonly now?: () => number;
}

export interface RateLimiter {
  /** Records a hit for `key`; false when the key is over its limit (the hit is not counted). */
  take(key: string): boolean;
}

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  // Map iteration order is insertion order: re-inserting on each hit keeps it LRU.
  const hits = new Map<string, number[]>();
  return {
    take(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => at > t - windowMs);
      hits.delete(key);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      while (hits.size > maxKeys) {
        const oldest = hits.keys().next();
        if (oldest.done) break;
        hits.delete(oldest.value);
      }
      return true;
    },
  };
}

/**
 * The client address as seen by the nearest proxy: the last `X-Forwarded-For` entry (the one our
 * proxy appended; earlier entries are client-supplied and spoofable), else `X-Real-IP`. Without
 * a proxy these headers come from the client, which is why the action also has a global limit.
 */
export function clientKey(headers: Pick<Headers, 'get'>): string {
  const forwarded = headers.get('x-forwarded-for');
  const last = forwarded?.split(',').at(-1)?.trim();
  const ip = last || headers.get('x-real-ip')?.trim() || 'unknown';
  return ip.slice(0, 64);
}
