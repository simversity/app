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

describe('GET /api/progress', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('returns empty progress for new user', async () => {
    const res = await app.request('/api/progress', asUser(TEACHER));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      progress: unknown[];
      total: number;
    };
    expect(body.progress).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  test('returns progress records with course/scenario data', async () => {
    // Seed a progress record
    const { testDb } = await import('../../__tests__/preload');
    const { progress } = await import('../../db/schema');
    testDb
      .insert(progress)
      .values({
        id: crypto.randomUUID(),
        userId: TEACHER.id,
        courseId: TEST_IDS.course1,
        scenarioId: TEST_IDS.scenario1,
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .run();

    const res = await app.request('/api/progress', asUser(TEACHER));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      progress: {
        status: string;
        course: { title: string };
        scenario: { title: string };
      }[];
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.progress[0].status).toBe('in_progress');
    expect(body.progress[0].course.title).toBe('Biology 101');
    expect(body.progress[0].scenario.title).toBe('Evolution Misconception');
  });

  test('isolates by user', async () => {
    const { testDb } = await import('../../__tests__/preload');
    const { progress } = await import('../../db/schema');
    testDb
      .insert(progress)
      .values({
        id: crypto.randomUUID(),
        userId: TEACHER.id,
        courseId: TEST_IDS.course1,
        scenarioId: TEST_IDS.scenario1,
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .run();

    const res = await app.request('/api/progress', asUser(TEACHER_2));
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(0);
  });

  test('returns 401 for unauthenticated', async () => {
    const res = await app.request('/api/progress');
    expect(res.status).toBe(401);
  });

  test('returns 403 for unverified', async () => {
    const res = await app.request('/api/progress', asUser(UNVERIFIED_TEACHER));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/progress/summary', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('returns summary stats', async () => {
    const res = await app.request('/api/progress/summary', asUser(TEACHER));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalConversations: number;
      totalScenariosPracticed: number;
      totalCourses: number;
      totalMessages: number;
      recentConversations: unknown[];
    };
    expect(body.totalConversations).toBe(0);
    expect(body.totalCourses).toBe(1);
    expect(body.recentConversations).toHaveLength(0);
  });

  test('includes conversations in summary', async () => {
    seedConversation({ status: 'active', messageCount: 3 });
    const res = await app.request('/api/progress/summary', asUser(TEACHER));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalConversations: number;
      totalMessages: number;
      recentConversations: { id: string; studentName: string }[];
    };
    expect(body.totalConversations).toBe(1);
    expect(body.totalMessages).toBe(3);
    expect(body.recentConversations).toHaveLength(1);
    expect(body.recentConversations[0].studentName).toBe('Riley');
  });

  test('returns 401 for unauthenticated', async () => {
    const res = await app.request('/api/progress/summary');
    expect(res.status).toBe(401);
  });
});
