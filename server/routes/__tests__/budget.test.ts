import { beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp } from '../../__tests__/test-app';
import { resetDb, seedMinimal } from '../../__tests__/test-fixtures';
import {
  asUser,
  registerAllTestUsers,
  TEACHER,
  UNVERIFIED_TEACHER,
} from '../../__tests__/test-users';

describe('GET /api/budget', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('returns budget status for authenticated user', async () => {
    const res = await app.request('/api/budget', asUser(TEACHER));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      used: number;
      limit: number;
      remaining: number;
      enabled: boolean;
    };
    expect(typeof body.used).toBe('number');
    expect(typeof body.limit).toBe('number');
    expect(typeof body.remaining).toBe('number');
    expect(typeof body.enabled).toBe('boolean');
  });

  test('returns 401 for unauthenticated request', async () => {
    const res = await app.request('/api/budget');
    expect(res.status).toBe(401);
  });

  test('returns 403 for unverified user', async () => {
    const res = await app.request('/api/budget', asUser(UNVERIFIED_TEACHER));
    expect(res.status).toBe(403);
  });

  test('budget remaining equals limit minus used', async () => {
    const res = await app.request('/api/budget', asUser(TEACHER));
    const body = (await res.json()) as {
      used: number;
      limit: number;
      remaining: number;
      enabled: boolean;
    };
    if (body.enabled) {
      expect(body.remaining).toBe(Math.max(0, body.limit - body.used));
    } else {
      expect(body.used).toBe(0);
      expect(body.limit).toBe(0);
      expect(body.remaining).toBe(0);
    }
  });
});
