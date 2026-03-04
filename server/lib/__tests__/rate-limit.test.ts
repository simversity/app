import { describe, expect, test } from 'bun:test';
import { createRateLimiter } from '../rate-limit';

describe('createRateLimiter', () => {
  test('allows requests under the limit', () => {
    const check = createRateLimiter(3, 60_000);
    expect(check('user1')).toBe(true);
    expect(check('user1')).toBe(true);
    expect(check('user1')).toBe(true);
  });

  test('blocks requests at the limit', () => {
    const check = createRateLimiter(2, 60_000);
    expect(check('user1')).toBe(true);
    expect(check('user1')).toBe(true);
    expect(check('user1')).toBe(false);
  });

  test('tracks keys independently', () => {
    const check = createRateLimiter(1, 60_000);
    expect(check('user1')).toBe(true);
    expect(check('user2')).toBe(true);
    expect(check('user1')).toBe(false);
    expect(check('user2')).toBe(false);
  });

  test('allows requests again after window expires', () => {
    const RealDateNow = Date.now;
    let now = RealDateNow.call(Date);
    Date.now = () => now;
    try {
      const check = createRateLimiter(1, 100);
      expect(check('user1')).toBe(true);
      expect(check('user1')).toBe(false);
      now += 101;
      expect(check('user1')).toBe(true);
    } finally {
      Date.now = RealDateNow;
    }
  });

  test('limit of 0 blocks all requests', () => {
    const check = createRateLimiter(0, 60_000);
    expect(check('user1')).toBe(false);
  });
});
