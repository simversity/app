import { beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp } from '../../__tests__/test-app';
import { resetDb, seedUsers } from '../../__tests__/test-fixtures';
import { registerAllTestUsers } from '../../__tests__/test-users';

describe('GET /api/health', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedUsers();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('returns 200 with status ok when DB is healthy', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  test('does not require authentication', async () => {
    // No X-Test-User-Id header
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });
});
