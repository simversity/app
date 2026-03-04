import { beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp } from '../../__tests__/test-app';
import { resetDb, seedMinimal } from '../../__tests__/test-fixtures';
import {
  ADMIN,
  asUser,
  registerAllTestUsers,
  SUPER_ADMIN,
  TEACHER,
  UNVERIFIED_TEACHER,
} from '../../__tests__/test-users';

/**
 * Tests middleware behavior (auth guards, role checks) using real route handlers.
 */

describe('requireVerified middleware', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('rejects unauthenticated requests with 401', async () => {
    const res = await app.request('/api/courses');
    expect(res.status).toBe(401);
  });

  test('rejects unverified user with 403', async () => {
    const res = await app.request('/api/courses', asUser(UNVERIFIED_TEACHER));
    expect(res.status).toBe(403);
  });

  test('allows verified teacher', async () => {
    const res = await app.request('/api/courses', asUser(TEACHER));
    expect(res.status).toBe(200);
  });

  test('allows admin', async () => {
    const res = await app.request('/api/courses', asUser(ADMIN));
    expect(res.status).toBe(200);
  });
});

describe('requireAdmin middleware', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('rejects unauthenticated requests with 401', async () => {
    const res = await app.request('/api/admin/courses');
    expect(res.status).toBe(401);
  });

  test('rejects teacher with 403', async () => {
    const res = await app.request('/api/admin/courses', asUser(TEACHER));
    expect(res.status).toBe(403);
  });

  test('allows admin', async () => {
    const res = await app.request('/api/admin/courses', asUser(ADMIN));
    expect(res.status).toBe(200);
  });

  test('allows super_admin', async () => {
    const res = await app.request('/api/admin/courses', asUser(SUPER_ADMIN));
    expect(res.status).toBe(200);
  });

  test('rejects unverified teacher with appropriate error', async () => {
    const res = await app.request(
      '/api/admin/courses',
      asUser(UNVERIFIED_TEACHER),
    );
    // requireAdmin calls getSessionOrFail which checks emailVerified
    expect(res.status).toBe(403);
  });
});

describe('request ID header', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('includes X-Request-Id in response', async () => {
    const res = await app.request('/api/health');
    const requestId = res.headers.get('X-Request-Id');
    expect(requestId).toBeTruthy();
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
