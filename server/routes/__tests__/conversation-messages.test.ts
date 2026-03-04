import { beforeEach, describe, expect, test } from 'bun:test';
import { createTestApp } from '../../__tests__/test-app';
import {
  resetDb,
  seedConversation,
  seedMinimal,
  TEST_IDS,
} from '../../__tests__/test-fixtures';
import {
  jsonPost,
  registerAllTestUsers,
  TEACHER,
  TEACHER_2,
  UNVERIFIED_TEACHER,
} from '../../__tests__/test-users';

describe('POST /api/conversations (start conversation)', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    registerAllTestUsers();
    app = createTestApp();
  });

  test('creates conversation with opening messages', async () => {
    const res = await app.request(
      '/api/conversations',
      jsonPost({ scenarioId: TEST_IDS.scenario1 }, TEACHER),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      conversation: { id: string; status: string };
      messages: { role: string; content: string; agentName: string | null }[];
    };
    expect(body.conversation.status).toBe('active');
    expect(body.messages.length).toBeGreaterThan(0);
    expect(body.messages[0].role).toBe('assistant');
    expect(body.messages[0].agentName).toBe('Riley');
  });

  test('returns existing active conversation instead of duplicate', async () => {
    // Create first
    const res1 = await app.request(
      '/api/conversations',
      jsonPost({ scenarioId: TEST_IDS.scenario1 }, TEACHER),
    );
    expect(res1.status).toBe(201);
    const body1 = (await res1.json()) as {
      conversation: { id: string };
    };

    // Second call returns same conversation
    const res2 = await app.request(
      '/api/conversations',
      jsonPost({ scenarioId: TEST_IDS.scenario1 }, TEACHER),
    );
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as {
      conversation: { id: string };
    };
    expect(body2.conversation.id).toBe(body1.conversation.id);
  });

  test('returns 404 for non-existent scenario', async () => {
    const res = await app.request(
      '/api/conversations',
      jsonPost({ scenarioId: '99999999-9999-4999-a999-999999999999' }, TEACHER),
    );
    expect(res.status).toBe(404);
  });

  test('returns 400 for invalid scenarioId', async () => {
    const res = await app.request(
      '/api/conversations',
      jsonPost({ scenarioId: 'not-a-uuid' }, TEACHER),
    );
    expect(res.status).toBe(400);
  });

  test('returns 401 for unauthenticated', async () => {
    const res = await app.request('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: TEST_IDS.scenario1 }),
    });
    expect(res.status).toBe(401);
  });

  test('returns 403 for unverified user', async () => {
    const res = await app.request(
      '/api/conversations',
      jsonPost({ scenarioId: TEST_IDS.scenario1 }, UNVERIFIED_TEACHER),
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/conversations/:id/messages (send message)', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    seedConversation({ status: 'active', messageCount: 2 });
    registerAllTestUsers();
    app = createTestApp();
  });

  test('sends message and gets SSE stream', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/messages`,
      jsonPost({ content: 'Can you explain more?' }, TEACHER),
    );
    // SSE returns 200 with text/event-stream content type
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type');
    expect(ct).toContain('text/event-stream');
  });

  test('returns 404 for other users conversation', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/messages`,
      jsonPost({ content: 'Hello' }, TEACHER_2),
    );
    expect(res.status).toBe(404);
  });

  test('returns 409 for completed conversation', async () => {
    // Reset and seed a completed conversation
    resetDb();
    seedMinimal();
    seedConversation({ status: 'completed', messageCount: 6 });
    registerAllTestUsers();

    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/messages`,
      jsonPost({ content: 'Hello' }, TEACHER),
    );
    expect(res.status).toBe(409);
  });

  test('returns 400 for empty content', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/messages`,
      jsonPost({ content: '' }, TEACHER),
    );
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid conversation UUID', async () => {
    const res = await app.request(
      '/api/conversations/not-a-uuid/messages',
      jsonPost({ content: 'Hello' }, TEACHER),
    );
    expect(res.status).toBe(400);
  });
});
