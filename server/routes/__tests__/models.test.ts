import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createTestApp } from '../../__tests__/test-app';
import { resetDb, seedUsers } from '../../__tests__/test-fixtures';
import {
  asUser,
  registerAllTestUsers,
  TEACHER,
  UNVERIFIED_TEACHER,
} from '../../__tests__/test-users';

// Mock fetchModels locally so route tests don't depend on network/cache state
mock.module('../../ai/models', () => ({
  fetchModels: async () => [
    {
      id: 'deepseek-ai/DeepSeek-V3.1',
      label: 'DeepSeek V3.1',
      context: '128K',
      tier: '$',
    },
  ],
}));

describe('GET /api/models', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedUsers();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('returns models for authenticated verified user', async () => {
    const res = await app.request('/api/models', asUser(TEACHER));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { models: { id: string }[] };
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.models[0].id).toBe('deepseek-ai/DeepSeek-V3.1');
  });

  test('returns 401 for unauthenticated request', async () => {
    const res = await app.request('/api/models');
    expect(res.status).toBe(401);
  });

  test('returns 403 for unverified user', async () => {
    const res = await app.request('/api/models', asUser(UNVERIFIED_TEACHER));
    expect(res.status).toBe(403);
  });
});
