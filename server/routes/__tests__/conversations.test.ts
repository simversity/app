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

describe('GET /api/conversations', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('returns empty list when no conversations', async () => {
    const res = await app.request('/api/conversations', asUser(TEACHER));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      conversations: unknown[];
      total: number;
    };
    expect(body.conversations).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  test('returns conversations for authenticated user', async () => {
    seedConversation();
    const res = await app.request('/api/conversations', asUser(TEACHER));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      conversations: {
        id: string;
        scenarioTitle: string;
        studentName: string;
      }[];
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.conversations[0].id).toBe(TEST_IDS.conversation1);
    expect(body.conversations[0].studentName).toBe('Riley');
  });

  test('filters by status', async () => {
    seedConversation({ status: 'completed' });
    const res = await app.request(
      '/api/conversations?status=active',
      asUser(TEACHER),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(0);
  });

  test('isolates by user — other user sees nothing', async () => {
    seedConversation();
    const res = await app.request('/api/conversations', asUser(TEACHER_2));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(0);
  });

  test('returns 401 for unauthenticated', async () => {
    const res = await app.request('/api/conversations');
    expect(res.status).toBe(401);
  });

  test('returns 403 for unverified', async () => {
    const res = await app.request(
      '/api/conversations',
      asUser(UNVERIFIED_TEACHER),
    );
    expect(res.status).toBe(403);
  });
});

describe('GET /api/conversations/:id', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    seedConversation();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('returns conversation with messages', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}`,
      asUser(TEACHER),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      messages: { role: string; content: string }[];
    };
    expect(body.id).toBe(TEST_IDS.conversation1);
    expect(body.messages.length).toBeGreaterThan(0);
  });

  test('returns 404 for other users conversation', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}`,
      asUser(TEACHER_2),
    );
    expect(res.status).toBe(404);
  });

  test('returns 400 for invalid UUID', async () => {
    const res = await app.request(
      '/api/conversations/not-a-uuid',
      asUser(TEACHER),
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/conversations/:id/complete', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('completes conversation with enough messages', async () => {
    seedConversation({ status: 'active', messageCount: 6 });
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/complete`,
      { method: 'PATCH', headers: { 'X-Test-User-Id': TEACHER.id } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  test('rejects completion with too few messages', async () => {
    seedConversation({ status: 'active', messageCount: 2 });
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/complete`,
      { method: 'PATCH', headers: { 'X-Test-User-Id': TEACHER.id } },
    );
    expect(res.status).toBe(400);
  });

  test('rejects completing already completed conversation', async () => {
    seedConversation({ status: 'completed', messageCount: 6 });
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/complete`,
      { method: 'PATCH', headers: { 'X-Test-User-Id': TEACHER.id } },
    );
    expect(res.status).toBe(409);
  });

  test('returns 404 for other users conversation', async () => {
    seedConversation({ status: 'active', messageCount: 6 });
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/complete`,
      { method: 'PATCH', headers: { 'X-Test-User-Id': TEACHER_2.id } },
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/conversations/:id/abandon', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('abandons active conversation', async () => {
    seedConversation({ status: 'active' });
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/abandon`,
      { method: 'PATCH', headers: { 'X-Test-User-Id': TEACHER.id } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  test('rejects abandoning already completed conversation', async () => {
    seedConversation({ status: 'completed' });
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/abandon`,
      { method: 'PATCH', headers: { 'X-Test-User-Id': TEACHER.id } },
    );
    expect(res.status).toBe(409);
  });
});
