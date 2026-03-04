import { beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp } from '../../__tests__/test-app';
import { resetDb, seedMinimal } from '../../__tests__/test-fixtures';
import {
  asUser,
  jsonPatch,
  registerAllTestUsers,
  TEACHER,
  UNVERIFIED_TEACHER,
} from '../../__tests__/test-users';

describe('GET /api/user/profile', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('returns profile for authenticated user', async () => {
    const res = await app.request('/api/user/profile', asUser(TEACHER));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      profile: { id: string; name: string; email: string; role: string };
    };
    expect(body.profile.id).toBe(TEACHER.id);
    expect(body.profile.name).toBe(TEACHER.name);
    expect(body.profile.email).toBe(TEACHER.email);
    expect(body.profile.role).toBe('teacher');
  });

  test('returns 401 for unauthenticated request', async () => {
    const res = await app.request('/api/user/profile');
    expect(res.status).toBe(401);
  });

  test('returns 403 for unverified user', async () => {
    const res = await app.request(
      '/api/user/profile',
      asUser(UNVERIFIED_TEACHER),
    );
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/user/profile', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('updates name', async () => {
    const res = await app.request(
      '/api/user/profile',
      jsonPatch({ name: 'Updated Name' }, TEACHER),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      profile: { name: string };
    };
    expect(body.profile.name).toBe('Updated Name');
  });

  test('updates gradeLevel', async () => {
    const res = await app.request(
      '/api/user/profile',
      jsonPatch({ gradeLevel: 'K-5' }, TEACHER),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      profile: { gradeLevel: string };
    };
    expect(body.profile.gradeLevel).toBe('K-5');
  });

  test('allows setting nullable fields to null', async () => {
    // First set a value
    await app.request(
      '/api/user/profile',
      jsonPatch({ gradeLevel: 'K-5' }, TEACHER),
    );
    // Then null it
    const res = await app.request(
      '/api/user/profile',
      jsonPatch({ gradeLevel: null }, TEACHER),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      profile: { gradeLevel: string | null };
    };
    expect(body.profile.gradeLevel).toBeNull();
  });

  test('rejects empty body', async () => {
    const res = await app.request('/api/user/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-User-Id': TEACHER.id,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('rejects invalid experienceYears', async () => {
    const res = await app.request(
      '/api/user/profile',
      jsonPatch({ experienceYears: -1 }, TEACHER),
    );
    expect(res.status).toBe(400);
  });

  test('returns 401 for unauthenticated request', async () => {
    const res = await app.request('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hacker' }),
    });
    expect(res.status).toBe(401);
  });
});
