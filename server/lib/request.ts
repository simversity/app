import type { Context } from 'hono';
import { getConnInfo } from 'hono/bun';
import { env } from './env';
import { log } from './logger';

const trustProxy = env.TRUST_PROXY === '1';

/** Extract the client IP address from a request context.
 *  When TRUST_PROXY=1, reads x-forwarded-for / x-real-ip headers (for use
 *  behind a reverse proxy like Railway). Otherwise uses the direct connection. */
export function getClientIp(c: Context): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
    const realIp = c.req.header('x-real-ip');
    if (realIp) return realIp;
  }
  const addr = getConnInfo(c).remote.address;
  if (!addr) log.warn('getClientIp: no remote address available');
  return addr || 'unknown';
}
