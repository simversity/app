import { beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp } from '../../__tests__/test-app';
import {
  resetDb,
  seedAdmin,
  seedMinimal,
  TEST_IDS,
} from '../../__tests__/test-fixtures';
import {
  ADMIN,
  asUser,
  deleteReq,
  jsonPatch,
  jsonPost,
  registerAllTestUsers,
  SUPER_ADMIN,
  TEACHER,
} from '../../__tests__/test-users';

// -------------------------------------------------------------------
// Admin role guard
// -------------------------------------------------------------------
describe('Admin role guard', () => {
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

  test('rejects teacher role with 403', async () => {
    const res = await app.request('/api/admin/courses', asUser(TEACHER));
    expect(res.status).toBe(403);
  });

  test('allows admin role', async () => {
    const res = await app.request('/api/admin/courses', asUser(ADMIN));
    expect(res.status).toBe(200);
  });

  test('allows super_admin role', async () => {
    const res = await app.request('/api/admin/courses', asUser(SUPER_ADMIN));
    expect(res.status).toBe(200);
  });
});

// -------------------------------------------------------------------
// Admin course CRUD
// -------------------------------------------------------------------
describe('Admin course CRUD', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedAdmin();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('GET /api/admin/courses returns all courses', async () => {
    const res = await app.request('/api/admin/courses', asUser(ADMIN));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      courses: { id: string }[];
      total: number;
    };
    expect(body.total).toBe(2);
  });

  test('GET /api/admin/courses/:id returns course', async () => {
    const res = await app.request(
      `/api/admin/courses/${TEST_IDS.course1}`,
      asUser(ADMIN),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      course: { id: string; title: string };
    };
    expect(body.course.title).toBe('Biology 101');
  });

  test('GET /api/admin/courses/:id returns 404 for missing', async () => {
    const res = await app.request(
      '/api/admin/courses/99999999-9999-9999-9999-999999999999',
      asUser(ADMIN),
    );
    expect(res.status).toBe(404);
  });

  test('GET /api/admin/courses/:id returns 400 for invalid UUID', async () => {
    const res = await app.request('/api/admin/courses/bad-id', asUser(ADMIN));
    expect(res.status).toBe(400);
  });

  test('POST creates course', async () => {
    const res = await app.request(
      '/api/admin/courses',
      jsonPost(
        {
          title: 'Physics 101',
          description: 'Intro to physics',
          gradeLevel: '11-12',
          subject: 'Physics',
        },
        ADMIN,
      ),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      course: { title: string; visibility: string };
    };
    expect(body.course.title).toBe('Physics 101');
    expect(body.course.visibility).toBe('private');
  });

  test('POST rejects missing title', async () => {
    const res = await app.request(
      '/api/admin/courses',
      jsonPost(
        {
          description: 'desc',
          gradeLevel: '9',
          subject: 'Math',
        },
        ADMIN,
      ),
    );
    expect(res.status).toBe(400);
  });

  test('PATCH updates course', async () => {
    const res = await app.request(
      `/api/admin/courses/${TEST_IDS.course1}`,
      jsonPatch({ title: 'Updated Biology' }, ADMIN),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      course: { title: string };
    };
    expect(body.course.title).toBe('Updated Biology');
  });

  test('PATCH rejects no fields', async () => {
    const res = await app.request(
      `/api/admin/courses/${TEST_IDS.course1}`,
      jsonPatch({}, ADMIN),
    );
    expect(res.status).toBe(400);
  });

  test('PATCH returns 404 for missing course', async () => {
    const res = await app.request(
      '/api/admin/courses/99999999-9999-9999-9999-999999999999',
      jsonPatch({ title: 'New' }, ADMIN),
    );
    expect(res.status).toBe(404);
  });

  test('DELETE archives course', async () => {
    const res = await app.request(
      `/api/admin/courses/${TEST_IDS.course1}`,
      deleteReq(ADMIN),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    // Verify it was archived
    const check = await app.request(
      `/api/admin/courses/${TEST_IDS.course1}`,
      asUser(ADMIN),
    );
    const checkBody = (await check.json()) as {
      course: { visibility: string };
    };
    expect(checkBody.course.visibility).toBe('archived');
  });

  test('DELETE returns 404 for missing course', async () => {
    const res = await app.request(
      '/api/admin/courses/99999999-9999-9999-9999-999999999999',
      deleteReq(ADMIN),
    );
    expect(res.status).toBe(404);
  });
});

// -------------------------------------------------------------------
// Admin persona CRUD
// -------------------------------------------------------------------
describe('Admin persona CRUD', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedAdmin();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('GET /api/admin/personas returns personas', async () => {
    const res = await app.request('/api/admin/personas', asUser(ADMIN));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      personas: { id: string }[];
      total: number;
    };
    expect(body.total).toBe(2);
  });

  test('GET /api/admin/personas/:id returns persona', async () => {
    const res = await app.request(
      `/api/admin/personas/${TEST_IDS.persona1}`,
      asUser(ADMIN),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      persona: { name: string };
    };
    expect(body.persona.name).toBe('Riley');
  });

  test('POST creates persona', async () => {
    const res = await app.request(
      '/api/admin/personas',
      jsonPost(
        {
          name: 'Sam',
          description: 'A shy student',
          systemPrompt: 'You are Sam, a shy student.',
        },
        ADMIN,
      ),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { persona: { name: string } };
    expect(body.persona.name).toBe('Sam');
  });

  test('POST rejects missing name', async () => {
    const res = await app.request(
      '/api/admin/personas',
      jsonPost({ description: 'desc', systemPrompt: 'prompt' }, ADMIN),
    );
    expect(res.status).toBe(400);
  });

  test('PATCH updates persona', async () => {
    const res = await app.request(
      `/api/admin/personas/${TEST_IDS.persona2}`,
      jsonPatch({ name: 'Updated Jordan' }, ADMIN),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { persona: { name: string } };
    expect(body.persona.name).toBe('Updated Jordan');
  });

  test('DELETE removes unused persona', async () => {
    // persona2 is not linked to any scenario agent
    const res = await app.request(
      `/api/admin/personas/${TEST_IDS.persona2}`,
      deleteReq(ADMIN),
    );
    expect(res.status).toBe(200);
  });

  test('DELETE prevents deletion of in-use persona', async () => {
    // persona1 is linked via scenarioAgent
    const res = await app.request(
      `/api/admin/personas/${TEST_IDS.persona1}`,
      deleteReq(ADMIN),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('scenario');
  });
});

// -------------------------------------------------------------------
// Admin access code CRUD
// -------------------------------------------------------------------
describe('Admin access code CRUD', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedAdmin();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('GET /api/admin/access-codes masks codes', async () => {
    const res = await app.request('/api/admin/access-codes', asUser(ADMIN));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      codes: { code: string }[];
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.codes[0].code).toMatch(/^\*{4}/);
    expect(body.codes[0].code).not.toContain('test-invite');
  });

  test('POST creates access code', async () => {
    const res = await app.request(
      '/api/admin/access-codes',
      jsonPost({}, ADMIN),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { code: string };
    expect(body.code.length).toBeGreaterThan(0);
  });

  test('POST rejects past expiresAt', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const res = await app.request(
      '/api/admin/access-codes',
      jsonPost({ expiresAt: past }, ADMIN),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('future');
  });

  test('DELETE removes unused code', async () => {
    const res = await app.request(
      `/api/admin/access-codes/${TEST_IDS.accessCode1}`,
      deleteReq(ADMIN),
    );
    expect(res.status).toBe(200);
  });

  test('DELETE returns 404 for missing code', async () => {
    const res = await app.request(
      '/api/admin/access-codes/99999999-9999-9999-9999-999999999999',
      deleteReq(ADMIN),
    );
    expect(res.status).toBe(404);
  });
});

// -------------------------------------------------------------------
// Admin user management
// -------------------------------------------------------------------
describe('Admin user management', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedAdmin();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('GET /api/admin/users returns users', async () => {
    const res = await app.request('/api/admin/users', asUser(ADMIN));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: { id: string }[];
      total: number;
    };
    expect(body.total).toBeGreaterThan(0);
  });

  test('PATCH changes user role', async () => {
    const res = await app.request(
      `/api/admin/users/${TEACHER.id}/role`,
      jsonPatch({ role: 'admin' }, ADMIN),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string };
    expect(body.role).toBe('admin');
  });

  test('PATCH rejects changing own role', async () => {
    const res = await app.request(
      `/api/admin/users/${ADMIN.id}/role`,
      jsonPatch({ role: 'teacher' }, ADMIN),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('own role');
  });

  test('PATCH returns 403 for super_admin target', async () => {
    const res = await app.request(
      `/api/admin/users/${SUPER_ADMIN.id}/role`,
      jsonPatch({ role: 'teacher' }, ADMIN),
    );
    expect(res.status).toBe(403);
  });

  test('PATCH returns 404 for missing user', async () => {
    const res = await app.request(
      '/api/admin/users/99999999-9999-9999-9999-999999999999/role',
      jsonPatch({ role: 'admin' }, ADMIN),
    );
    expect(res.status).toBe(404);
  });

  test('PATCH rejects invalid role', async () => {
    const res = await app.request(
      `/api/admin/users/${TEACHER.id}/role`,
      jsonPatch({ role: 'super_admin' }, ADMIN),
    );
    expect(res.status).toBe(400);
  });
});

// -------------------------------------------------------------------
// Admin scenario CRUD
// -------------------------------------------------------------------
describe('Admin scenario CRUD', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedAdmin();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('GET lists scenarios for course', async () => {
    const res = await app.request(
      `/api/admin/courses/${TEST_IDS.course1}/scenarios`,
      asUser(ADMIN),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      scenarios: { id: string }[];
      total: number;
    };
    expect(body.total).toBe(1);
  });

  test('GET returns 404 for missing course', async () => {
    const res = await app.request(
      '/api/admin/courses/99999999-9999-9999-9999-999999999999/scenarios',
      asUser(ADMIN),
    );
    expect(res.status).toBe(404);
  });

  test('POST creates scenario with agents', async () => {
    const res = await app.request(
      `/api/admin/courses/${TEST_IDS.course1}/scenarios`,
      jsonPost(
        {
          title: 'New Scenario',
          description: 'A test scenario',
          agents: [
            {
              personaId: TEST_IDS.persona1,
              openingMessage: 'Hello teacher!',
            },
          ],
        },
        ADMIN,
      ),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      scenario: { title: string };
    };
    expect(body.scenario.title).toBe('New Scenario');
  });

  test('POST rejects scenario without agents', async () => {
    const res = await app.request(
      `/api/admin/courses/${TEST_IDS.course1}/scenarios`,
      jsonPost(
        {
          title: 'Test',
          description: 'Test',
          agents: [],
        },
        ADMIN,
      ),
    );
    expect(res.status).toBe(400);
  });

  test('POST rejects scenario with no opening messages', async () => {
    const res = await app.request(
      `/api/admin/courses/${TEST_IDS.course1}/scenarios`,
      jsonPost(
        {
          title: 'Test',
          description: 'Test',
          agents: [{ personaId: TEST_IDS.persona1 }],
        },
        ADMIN,
      ),
    );
    expect(res.status).toBe(400);
  });

  test('POST rejects invalid persona IDs', async () => {
    const res = await app.request(
      `/api/admin/courses/${TEST_IDS.course1}/scenarios`,
      jsonPost(
        {
          title: 'Test',
          description: 'Test',
          agents: [
            {
              personaId: '99999999-9999-9999-9999-999999999999',
              openingMessage: 'Hello',
            },
          ],
        },
        ADMIN,
      ),
    );
    expect(res.status).toBe(400);
  });

  test('GET /api/admin/scenarios/:id returns scenario', async () => {
    const res = await app.request(
      `/api/admin/scenarios/${TEST_IDS.scenario1}`,
      asUser(ADMIN),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      scenario: { title: string; agents: unknown[] };
    };
    expect(body.scenario.title).toBe('Evolution Misconception');
    expect(body.scenario.agents).toHaveLength(1);
  });

  test('PATCH updates scenario', async () => {
    const res = await app.request(
      `/api/admin/scenarios/${TEST_IDS.scenario1}`,
      jsonPatch({ title: 'Updated Scenario' }, ADMIN),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      scenario: { title: string };
    };
    expect(body.scenario.title).toBe('Updated Scenario');
  });

  test('DELETE returns 409 when conversations exist', async () => {
    // Seed a conversation referencing the scenario
    const { testDb } = await import('../../__tests__/preload');
    const { conversation } = await import('../../db/schema');
    testDb
      .insert(conversation)
      .values({
        id: crypto.randomUUID(),
        userId: TEACHER.id,
        scenarioId: TEST_IDS.scenario1,
        status: 'active',
        startedAt: new Date(),
        messageCount: 0,
        observerMessageCount: 0,
        updatedAt: new Date(),
      })
      .run();

    const res = await app.request(
      `/api/admin/scenarios/${TEST_IDS.scenario1}`,
      deleteReq(ADMIN),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('conversations');
  });
});
