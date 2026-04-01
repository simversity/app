import { beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp } from '../../__tests__/test-app';
import {
  resetDb,
  seedConversation,
  seedMinimal,
  TEST_IDS,
} from '../../__tests__/test-fixtures';
import {
  asUser,
  registerAllTestUsers,
  TEACHER,
  TEACHER_2,
  UNVERIFIED_TEACHER,
} from '../../__tests__/test-users';

describe('GET /api/conversations/:id/files', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    seedConversation();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('returns empty file list for conversation with no files', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/files`,
      asUser(TEACHER),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });

  test('returns 404 for non-existent conversation', async () => {
    const fakeId = '99999999-0000-4000-a000-000000000099';
    const res = await app.request(
      `/api/conversations/${fakeId}/files`,
      asUser(TEACHER),
    );
    expect(res.status).toBe(404);
  });

  test('returns 404 when accessing another user conversation', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/files`,
      asUser(TEACHER_2),
    );
    expect(res.status).toBe(404);
  });

  test('returns 401 for unauthenticated request', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/files`,
    );
    expect(res.status).toBe(401);
  });

  test('returns 403 for unverified user', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/files`,
      asUser(UNVERIFIED_TEACHER),
    );
    expect(res.status).toBe(403);
  });

  test('returns 400 for invalid UUID', async () => {
    const res = await app.request(
      '/api/conversations/not-a-uuid/files',
      asUser(TEACHER),
    );
    expect(res.status).toBe(400);
  });
});
