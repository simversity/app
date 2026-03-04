import type { Context } from 'hono';
import { RATE_LIMIT_WINDOW_MS } from './env';

export type RateLimitInfo = {
  limit: number;
  remaining: number;
  resetMs: number;
};

const CLEANUP_INTERVAL_MS = 60_000;
const cleanupTimers: ReturnType<typeof setInterval>[] = [];

export function createRateLimiter(
  maxRequests: number,
  windowMs = RATE_LIMIT_WINDOW_MS,
) {
  const store = new Map<string, number[]>();

  /** Evict expired entries for all keys. */
  function cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of store) {
      const active = timestamps.filter((t) => now - t < windowMs);
      if (active.length === 0) store.delete(key);
      else store.set(key, active);
    }
  }

  const timer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
  timer.unref();
  cleanupTimers.push(timer);

  function check(key: string): boolean {
    const now = Date.now();
    const timestamps = (store.get(key) || []).filter((t) => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
      store.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    store.set(key, timestamps);
    return true;
  }

  /** Return rate limit metadata for the given key without consuming a slot. */
  check.info = function info(key: string): RateLimitInfo {
    const now = Date.now();
    const timestamps = (store.get(key) || []).filter((t) => now - t < windowMs);
    const oldest = timestamps[0] ?? now;
    return {
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - timestamps.length),
      resetMs: oldest + windowMs,
    };
  };

  return check;
}

/** Set standard rate limit headers on a Hono response context. */
export function setRateLimitHeaders(c: Context, info: RateLimitInfo): void {
  c.header('X-RateLimit-Limit', String(info.limit));
  c.header('X-RateLimit-Remaining', String(info.remaining));
  c.header('X-RateLimit-Reset', String(Math.ceil(info.resetMs / 1000)));
}

/** Clear all periodic rate-limit cleanup timers (called during graceful shutdown). */
export function clearRateLimitTimers(): void {
  for (const timer of cleanupTimers) {
    clearInterval(timer);
  }
  cleanupTimers.length = 0;
}
