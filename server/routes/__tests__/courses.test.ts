import { beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp } from '../../__tests__/test-app';
import { resetDb, seedMinimal, TEST_IDS } from '../../__tests__/test-fixtures';
import {
  asUser,
  registerAllTestUsers,
  TEACHER,
  UNVERIFIED_TEACHER,
} from '../../__tests__/test-users';

describe('GET /api/courses', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('returns published courses for verified user', async () => {
    const res = await app.request('/api/courses', asUser(TEACHER));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      courses: { id: string; title: string; visibility: string }[];
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.courses[0].title).toBe('Biology 101');
    expect(body.courses[0].visibility).toBe('published');
  });

  test('returns 401 for unauthenticated request', async () => {
    const res = await app.request('/api/courses');
    expect(res.status).toBe(401);
  });

  test('returns 403 for unverified user', async () => {
    const res = await app.request('/api/courses', asUser(UNVERIFIED_TEACHER));
    expect(res.status).toBe(403);
  });

  test('supports pagination', async () => {
    const res = await app.request(
      '/api/courses?limit=10&offset=0',
      asUser(TEACHER),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { courses: unknown[]; total: number };
    expect(body.total).toBe(1);
  });
});

describe('GET /api/courses/:id', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('returns course with scenarios for valid ID', async () => {
    const res = await app.request(
      `/api/courses/${TEST_IDS.course1}`,
      asUser(TEACHER),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      title: string;
      scenarios: { id: string; studentName: string }[];
    };
    expect(body.id).toBe(TEST_IDS.course1);
    expect(body.title).toBe('Biology 101');
    expect(body.scenarios).toHaveLength(1);
    expect(body.scenarios[0].studentName).toBe('Riley');
  });

  test('returns 404 for non-existent course', async () => {
    const res = await app.request(
      '/api/courses/99999999-9999-9999-9999-999999999999',
      asUser(TEACHER),
    );
    expect(res.status).toBe(404);
  });

  test('returns 400 for invalid UUID', async () => {
    const res = await app.request('/api/courses/not-a-uuid', asUser(TEACHER));
    expect(res.status).toBe(400);
  });

  test('returns 401 for unauthenticated request', async () => {
    const res = await app.request(`/api/courses/${TEST_IDS.course1}`);
    expect(res.status).toBe(401);
  });
});
