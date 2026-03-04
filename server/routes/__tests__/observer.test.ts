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
  jsonPost,
  registerAllTestUsers,
  TEACHER,
  TEACHER_2,
} from '../../__tests__/test-users';

describe('GET /api/conversations/:id/observer', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    seedConversation({ status: 'active' });
    registerAllTestUsers();
    app = createTestApp();
  });

  test('returns empty observer messages for new conversation', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/observer`,
      asUser(TEACHER),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      messages: unknown[];
      total: number;
    };
    expect(body.messages).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  test('returns 404 for other users conversation', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/observer`,
      asUser(TEACHER_2),
    );
    expect(res.status).toBe(404);
  });

  test('returns 400 for invalid UUID', async () => {
    const res = await app.request(
      '/api/conversations/not-a-uuid/observer',
      asUser(TEACHER),
    );
    expect(res.status).toBe(400);
  });

  test('returns 401 for unauthenticated', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/observer`,
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/conversations/:id/observer', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetDb();
    seedMinimal();
    seedConversation({ status: 'active', messageCount: 4 });
    registerAllTestUsers();
    app = createTestApp();
  });

  test('sends observer message and gets SSE stream', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/observer`,
      jsonPost({ content: 'How am I doing?' }, TEACHER),
    );
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type');
    expect(ct).toContain('text/event-stream');
  });

  test('returns 404 for other users conversation', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/observer`,
      jsonPost({ content: 'How am I doing?' }, TEACHER_2),
    );
    expect(res.status).toBe(404);
  });

  test('rejects observer message on abandoned conversation', async () => {
    resetDb();
    seedMinimal();
    seedConversation({ status: 'abandoned' });
    registerAllTestUsers();

    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/observer`,
      jsonPost({ content: 'How am I doing?' }, TEACHER),
    );
    expect(res.status).toBe(409);
  });

  test('allows observer on completed conversation', async () => {
    resetDb();
    seedMinimal();
    seedConversation({ status: 'completed', messageCount: 6 });
    registerAllTestUsers();

    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/observer`,
      jsonPost({ content: 'Post-conversation feedback?' }, TEACHER),
    );
    // Should succeed (200 with SSE stream)
    expect(res.status).toBe(200);
  });

  test('rejects empty content', async () => {
    const res = await app.request(
      `/api/conversations/${TEST_IDS.conversation1}/observer`,
      jsonPost({ content: '' }, TEACHER),
    );
    expect(res.status).toBe(400);
  });
});
