import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { SSEStreamingApi } from 'hono/streaming';
import type { OpenAI } from 'openai';
import { testDb, testSqlite } from '../../__tests__/preload';
import { resetDb, seedMinimal, TEST_IDS } from '../../__tests__/test-fixtures';
import { TEACHER } from '../../__tests__/test-users';
import * as schema from '../../db/schema';

// ---------------------------------------------------------------------------
// Mocks — only shutdown module (stream tracking), not the DB transaction
// ---------------------------------------------------------------------------

/** Tracks trackStream / untrackStream calls */
let trackStreamCalls = 0;
let untrackStreamCalls = 0;

const _activeStreams = new Set<AbortController>();
const _userStreamCounts = new Map<string, number>();
let _shuttingDown = false;
const _MAX_ACTIVE = 500;
const _MAX_USER = 5;

mock.module('../shutdown', () => ({
  MAX_ACTIVE_STREAMS: _MAX_ACTIVE,
  MAX_USER_STREAMS: _MAX_USER,
  isShuttingDown: () => _shuttingDown,
  setShuttingDown: () => {
    _shuttingDown = true;
  },
  canAcceptStream: (userId?: string) => {
    if (_shuttingDown || _activeStreams.size >= _MAX_ACTIVE) return false;
    if (userId && (_userStreamCounts.get(userId) ?? 0) >= _MAX_USER)
      return false;
    return true;
  },
  trackStream: (userId?: string) => {
    trackStreamCalls++;
    const ac = new AbortController();
    _activeStreams.add(ac);
    if (userId) {
      _userStreamCounts.set(userId, (_userStreamCounts.get(userId) ?? 0) + 1);
    }
    return ac;
  },
  untrackStream: (ac: AbortController, userId?: string) => {
    untrackStreamCalls++;
    _activeStreams.delete(ac);
    if (userId) {
      const count = (_userStreamCounts.get(userId) ?? 0) - 1;
      if (count <= 0) _userStreamCounts.delete(userId);
      else _userStreamCounts.set(userId, count);
    }
  },
  getActiveStreamCount: () => _activeStreams.size,
  resetStreamTracker: () => {
    _activeStreams.clear();
    _userStreamCounts.clear();
    _shuttingDown = false;
  },
  initGracefulShutdown: () => {},
}));

// Import AFTER mocks are installed
const { saveUserMessage, streamAndSaveAIResponse } = await import(
  '../streaming'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONV_ID = TEST_IDS.conversation1;

/** Seed a conversation with no messages. */
function seedTestConversation() {
  testDb
    .insert(schema.conversation)
    .values({
      id: CONV_ID,
      userId: TEACHER.id,
      scenarioId: TEST_IDS.scenario1,
      status: 'active',
      messageCount: 0,
      observerMessageCount: 0,
    })
    .run();
}

/** Seed N existing messages into the conversation. */
function seedMessages(count: number) {
  for (let i = 0; i < count; i++) {
    testDb
      .insert(schema.message)
      .values({
        id: crypto.randomUUID(),
        conversationId: CONV_ID,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        agentId: i % 2 === 1 ? TEST_IDS.persona1 : null,
        sortOrder: i,
      })
      .run();
  }
  // Update the conversation counter to match
  if (count > 0) {
    testSqlite.exec(
      `UPDATE conversation SET messageCount = ${count} WHERE id = '${CONV_ID}'`,
    );
  }
}

/** Seed N existing observer messages into the conversation. */
function seedObserverMessages(count: number) {
  for (let i = 0; i < count; i++) {
    testDb
      .insert(schema.observerMessage)
      .values({
        id: crypto.randomUUID(),
        conversationId: CONV_ID,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Observer message ${i}`,
        sortOrder: i,
      })
      .run();
  }
  if (count > 0) {
    testSqlite.exec(
      `UPDATE conversation SET observerMessageCount = ${count} WHERE id = '${CONV_ID}'`,
    );
  }
}

function createMockSSEStream(): SSEStreamingApi & {
  events: Array<{ data: string; event: string }>;
} {
  const events: Array<{ data: string; event: string }> = [];
  return {
    events,
    aborted: false,
    writeSSE: mock(async (msg: { data: string; event: string }) => {
      events.push(msg);
    }),
  } as unknown as SSEStreamingApi & {
    events: Array<{ data: string; event: string }>;
  };
}

/**
 * Create an async iterable that yields the given chunks, simulating an
 * OpenAI streaming response.
 */
function createAIStream(
  texts: string[],
): AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const text of texts) {
        yield {
          choices: [{ delta: { content: text } }],
        } as unknown as OpenAI.Chat.Completions.ChatCompletionChunk;
      }
    },
  };
}

/**
 * Create an async iterable that throws after optionally yielding some chunks.
 */
function createFailingAIStream(
  error: Error,
  textsBeforeError: string[] = [],
): AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const text of textsBeforeError) {
        yield {
          choices: [{ delta: { content: text } }],
        } as unknown as OpenAI.Chat.Completions.ChatCompletionChunk;
      }
      throw error;
    },
  };
}

/** Query all messages in the test conversation, ordered by sortOrder. */
async function getMessages() {
  return testDb
    .select()
    .from(schema.message)
    .where(eq(schema.message.conversationId, CONV_ID))
    .orderBy(schema.message.sortOrder);
}

/** Query the test conversation row. */
async function getConversation() {
  const [conv] = await testDb
    .select()
    .from(schema.conversation)
    .where(eq(schema.conversation.id, CONV_ID));
  return conv;
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDb();
  seedMinimal();
  seedTestConversation();
  trackStreamCalls = 0;
  untrackStreamCalls = 0;
});

// ---------------------------------------------------------------------------
// saveUserMessage
// ---------------------------------------------------------------------------

describe('saveUserMessage', () => {
  test('returns sortOrder based on existing message count', async () => {
    seedMessages(3);

    const sortOrder = await saveUserMessage({
      table: 'message',
      conversationId: CONV_ID,
      messageId: 'msg-new',
      content: 'Hello student',
      counterField: 'messageCount',
    });

    expect(sortOrder).toBe(3);

    // Verify the message was actually saved
    const messages = await getMessages();
    const newMsg = messages.find((m) => m.id === 'msg-new');
    expect(newMsg).toBeDefined();
    expect(newMsg?.content).toBe('Hello student');
    expect(newMsg?.sortOrder).toBe(3);

    // Verify counter was incremented
    const conv = await getConversation();
    expect(conv.messageCount).toBe(4);
  });

  test('returns 0 sortOrder when there are no existing messages', async () => {
    const sortOrder = await saveUserMessage({
      table: 'message',
      conversationId: CONV_ID,
      messageId: 'msg-first',
      content: 'First message',
      counterField: 'messageCount',
    });

    expect(sortOrder).toBe(0);

    const conv = await getConversation();
    expect(conv.messageCount).toBe(1);
  });

  test('inserts the user message with correct values', async () => {
    seedMessages(5);

    await saveUserMessage({
      table: 'message',
      conversationId: CONV_ID,
      messageId: 'msg-check',
      content: 'Test content',
      counterField: 'messageCount',
    });

    const messages = await getMessages();
    const saved = messages.find((m) => m.id === 'msg-check');
    expect(saved).toBeDefined();
    expect(saved?.role).toBe('user');
    expect(saved?.content).toBe('Test content');
    expect(saved?.sortOrder).toBe(5);
    expect(saved?.agentId).toBeNull();

    const conv = await getConversation();
    expect(conv.messageCount).toBe(6);
  });

  test('handles extra columns in the insert', async () => {
    // Use observerMessage table for extra test since the message table has a
    // CHECK constraint preventing agentId on user-role messages.
    await saveUserMessage({
      table: 'observerMessage',
      conversationId: CONV_ID,
      messageId: 'obs-extra',
      content: 'Observer with extra',
      counterField: 'observerMessageCount',
      extra: {},
    });

    const [saved] = await testDb
      .select()
      .from(schema.observerMessage)
      .where(eq(schema.observerMessage.id, 'obs-extra'));
    expect(saved).toBeDefined();
    expect(saved.role).toBe('user');
    expect(saved.content).toBe('Observer with extra');
    expect(saved.sortOrder).toBe(0);
  });

  test('works with observerMessage table and observerMessageCount', async () => {
    seedObserverMessages(2);

    const sortOrder = await saveUserMessage({
      table: 'observerMessage',
      conversationId: CONV_ID,
      messageId: 'obs-new',
      content: 'Observer question',
      counterField: 'observerMessageCount',
    });

    expect(sortOrder).toBe(2);

    const conv = await getConversation();
    expect(conv.observerMessageCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// streamAndSaveAIResponse
// ---------------------------------------------------------------------------

describe('streamAndSaveAIResponse', () => {
  test('streams chunks, saves response, and sends SSE done event', async () => {
    const sseStream = createMockSSEStream();
    const aiStream = createAIStream(['Hello', ' world', '!']);

    await streamAndSaveAIResponse({
      stream: sseStream,
      aiStream,
      conversationId: CONV_ID,
      table: 'message',
      counterField: 'messageCount',
      sortOrder: 0,
      errorLabel: 'AI error',
      emptyLabel: 'Empty response',
    });

    // Should have 3 delta events + 1 done event
    expect(sseStream.events.length).toBe(4);

    // Check delta events
    const deltas = sseStream.events.filter((e) => {
      const parsed = JSON.parse(e.data);
      return parsed.type === 'delta';
    });
    expect(deltas.length).toBe(3);
    expect(JSON.parse(deltas[0].data).text).toBe('Hello');
    expect(JSON.parse(deltas[1].data).text).toBe(' world');
    expect(JSON.parse(deltas[2].data).text).toBe('!');

    // Check done event
    const doneEvent = sseStream.events[sseStream.events.length - 1];
    const doneData = JSON.parse(doneEvent.data);
    expect(doneData.type).toBe('done');
    expect(doneData.messageId).toBeDefined();
    expect(typeof doneData.messageId).toBe('string');

    // Verify message was saved to DB
    const messages = await getMessages();
    const aiMsg = messages.find((m) => m.id === doneData.messageId);
    expect(aiMsg).toBeDefined();
    expect(aiMsg?.role).toBe('assistant');
    expect(aiMsg?.content).toBe('Hello world!');
    expect(aiMsg?.sortOrder).toBe(0);

    // Verify counter was incremented
    const conv = await getConversation();
    expect(conv.messageCount).toBe(1);
  });

  test('tracks and untracks stream even on success', async () => {
    const sseStream = createMockSSEStream();
    const aiStream = createAIStream(['ok']);

    const beforeTrack = trackStreamCalls;
    const beforeUntrack = untrackStreamCalls;

    await streamAndSaveAIResponse({
      stream: sseStream,
      aiStream,
      conversationId: CONV_ID,
      table: 'message',
      counterField: 'messageCount',
      sortOrder: 0,
      errorLabel: 'AI error',
      emptyLabel: 'Empty response',
    });

    expect(trackStreamCalls).toBe(beforeTrack + 1);
    expect(untrackStreamCalls).toBe(beforeUntrack + 1);
  });

  test('sends SSE error on AI stream failure and saves tombstone', async () => {
    const sseStream = createMockSSEStream();
    const aiStream = createFailingAIStream(new Error('Model overloaded'), [
      'partial',
    ]);

    await streamAndSaveAIResponse({
      stream: sseStream,
      aiStream,
      conversationId: CONV_ID,
      table: 'message',
      counterField: 'messageCount',
      sortOrder: 0,
      errorLabel: 'Student agent failed',
      emptyLabel: 'Empty response',
    });

    // Should have 1 delta (partial) + 1 error event
    expect(sseStream.events.length).toBe(2);

    const errorEvent = sseStream.events[sseStream.events.length - 1];
    const errorData = JSON.parse(errorEvent.data);
    expect(errorData.type).toBe('error');
    expect(errorData.message).toBe('Student agent failed');

    // Tombstone message should be saved in DB
    const messages = await getMessages();
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].content).toContain('Could not generate a response');
  });

  test('sends SSE error on empty response and saves tombstone', async () => {
    const sseStream = createMockSSEStream();
    // Stream yields empty/whitespace-only content
    const aiStream = createAIStream(['', '   ', '']);

    await streamAndSaveAIResponse({
      stream: sseStream,
      aiStream,
      conversationId: CONV_ID,
      table: 'message',
      counterField: 'messageCount',
      sortOrder: 0,
      errorLabel: 'AI error',
      emptyLabel: 'Student gave no response',
    });

    const errorEvents = sseStream.events.filter((e) => {
      const parsed = JSON.parse(e.data);
      return parsed.type === 'error';
    });
    expect(errorEvents.length).toBe(1);
    expect(JSON.parse(errorEvents[0].data).message).toBe(
      'Student gave no response',
    );

    // Tombstone should be saved
    const messages = await getMessages();
    expect(messages.length).toBe(1);
    expect(messages[0].content).toContain('Could not generate a response');
  });

  test('sends SSE error with "failed to save" when transaction throws', async () => {
    const sseStream = createMockSSEStream();
    const aiStream = createAIStream(['Good', ' answer']);

    // Temporarily make transaction fail for this specific test
    const txSpy = spyOn(
      testDb as unknown as Record<string, (...args: unknown[]) => unknown>,
      'transaction',
    ).mockImplementationOnce(async () => {
      throw new Error('SQLITE_BUSY');
    });

    await streamAndSaveAIResponse({
      stream: sseStream,
      aiStream,
      conversationId: CONV_ID,
      table: 'message',
      counterField: 'messageCount',
      sortOrder: 0,
      errorLabel: 'AI error',
      emptyLabel: 'Empty response',
    });

    txSpy.mockRestore();

    // 2 delta events + 1 error event
    expect(sseStream.events.length).toBe(3);

    const errorEvent = sseStream.events[sseStream.events.length - 1];
    const errorData = JSON.parse(errorEvent.data);
    expect(errorData.type).toBe('error');
    expect(errorData.message).toBe('Response received but failed to save');
  });

  test('calls afterSave callback inside the save transaction', async () => {
    const sseStream = createMockSSEStream();
    const aiStream = createAIStream(['Some response']);
    let afterSaveCalled = false;
    let receivedAiMsgId: string | null = null;

    await streamAndSaveAIResponse({
      stream: sseStream,
      aiStream,
      conversationId: CONV_ID,
      table: 'message',
      counterField: 'messageCount',
      sortOrder: 0,
      errorLabel: 'AI error',
      emptyLabel: 'Empty response',
      afterSave: async (_tx, aiMsgId) => {
        afterSaveCalled = true;
        receivedAiMsgId = aiMsgId;
      },
    });

    expect(afterSaveCalled).toBe(true);
    expect(receivedAiMsgId).not.toBeNull();
    expect(typeof receivedAiMsgId).toBe('string');

    // The done event messageId should match what afterSave received
    const doneEvent = sseStream.events[sseStream.events.length - 1];
    const doneData = JSON.parse(doneEvent.data);
    expect(doneData.messageId).toBe(receivedAiMsgId);
  });

  test('includes extraDone fields in the SSE done event', async () => {
    const sseStream = createMockSSEStream();
    const aiStream = createAIStream(['Response']);

    await streamAndSaveAIResponse({
      stream: sseStream,
      aiStream,
      conversationId: CONV_ID,
      table: 'message',
      counterField: 'messageCount',
      sortOrder: 0,
      errorLabel: 'AI error',
      emptyLabel: 'Empty response',
      extraDone: { conversationStatus: 'completed', score: 42 },
    });

    const doneEvent = sseStream.events[sseStream.events.length - 1];
    const doneData = JSON.parse(doneEvent.data);
    expect(doneData.type).toBe('done');
    expect(doneData.conversationStatus).toBe('completed');
    expect(doneData.score).toBe(42);
  });

  test('passes extraInsert fields to the AI message insert', async () => {
    const sseStream = createMockSSEStream();
    const aiStream = createAIStream(['Agent reply']);

    await streamAndSaveAIResponse({
      stream: sseStream,
      aiStream,
      conversationId: CONV_ID,
      table: 'message',
      counterField: 'messageCount',
      sortOrder: 0,
      errorLabel: 'AI error',
      emptyLabel: 'Empty response',
      extraInsert: { agentId: TEST_IDS.persona1 },
    });

    // Verify the saved message has the extra fields
    const messages = await getMessages();
    const aiMsg = messages.find((m) => m.role === 'assistant');
    expect(aiMsg).toBeDefined();
    expect(aiMsg?.agentId).toBe(TEST_IDS.persona1);
    expect(aiMsg?.content).toBe('Agent reply');
    expect(aiMsg?.sortOrder).toBe(0);
  });

  test('handles chunks with missing delta content gracefully', async () => {
    const sseStream = createMockSSEStream();

    // Some chunks have no delta content (e.g. finish_reason chunks)
    const aiStream = {
      async *[Symbol.asyncIterator]() {
        yield {
          choices: [{ delta: { content: 'Hi' } }],
        } as unknown as OpenAI.Chat.Completions.ChatCompletionChunk;
        yield {
          choices: [{ delta: {} }],
        } as unknown as OpenAI.Chat.Completions.ChatCompletionChunk;
        yield {
          choices: [{ delta: { content: ' there' } }],
        } as unknown as OpenAI.Chat.Completions.ChatCompletionChunk;
        yield {
          choices: [],
        } as unknown as OpenAI.Chat.Completions.ChatCompletionChunk;
      },
    };

    await streamAndSaveAIResponse({
      stream: sseStream,
      aiStream,
      conversationId: CONV_ID,
      table: 'message',
      counterField: 'messageCount',
      sortOrder: 0,
      errorLabel: 'AI error',
      emptyLabel: 'Empty response',
    });

    // Only 2 real delta events + 1 done
    const deltas = sseStream.events.filter((e) => {
      const parsed = JSON.parse(e.data);
      return parsed.type === 'delta';
    });
    expect(deltas.length).toBe(2);
    expect(JSON.parse(deltas[0].data).text).toBe('Hi');
    expect(JSON.parse(deltas[1].data).text).toBe(' there');

    const doneEvent = sseStream.events[sseStream.events.length - 1];
    expect(JSON.parse(doneEvent.data).type).toBe('done');

    // Verify saved content is concatenated correctly
    const messages = await getMessages();
    expect(messages[0].content).toBe('Hi there');
  });

  test('calls onAIFailure on AI stream error', async () => {
    const sseStream = createMockSSEStream();
    const aiStream = createFailingAIStream(new Error('Model timeout'));
    let failureCalled = false;

    await streamAndSaveAIResponse({
      stream: sseStream,
      aiStream,
      conversationId: CONV_ID,
      table: 'message',
      counterField: 'messageCount',
      sortOrder: 0,
      errorLabel: 'AI error',
      emptyLabel: 'Empty response',
      onAIFailure: () => {
        failureCalled = true;
      },
    });

    expect(failureCalled).toBe(true);
  });

  test('calls onAIFailure on empty response', async () => {
    const sseStream = createMockSSEStream();
    const aiStream = createAIStream(['', '   ']);
    let failureCalled = false;

    await streamAndSaveAIResponse({
      stream: sseStream,
      aiStream,
      conversationId: CONV_ID,
      table: 'message',
      counterField: 'messageCount',
      sortOrder: 0,
      errorLabel: 'AI error',
      emptyLabel: 'Empty response',
      onAIFailure: () => {
        failureCalled = true;
      },
    });

    expect(failureCalled).toBe(true);
  });

  test('does not call onAIFailure on success', async () => {
    const sseStream = createMockSSEStream();
    const aiStream = createAIStream(['Good response']);
    let failureCalled = false;

    await streamAndSaveAIResponse({
      stream: sseStream,
      aiStream,
      conversationId: CONV_ID,
      table: 'message',
      counterField: 'messageCount',
      sortOrder: 0,
      errorLabel: 'AI error',
      emptyLabel: 'Empty response',
      onAIFailure: () => {
        failureCalled = true;
      },
    });

    expect(failureCalled).toBe(false);
  });

  test('truncates response exceeding MAX_RESPONSE_BYTES and sends done with truncated flag', async () => {
    const sseStream = createMockSSEStream();
    // First chunk is 300KB, second is 300KB — total 600KB > 512KB limit.
    // The second chunk pushes us over the limit and is rejected before being sent.
    const chunk300k = 'x'.repeat(300 * 1024);
    const aiStream = createAIStream([
      chunk300k,
      chunk300k,
      'should not appear',
    ]);

    await streamAndSaveAIResponse({
      stream: sseStream,
      aiStream,
      conversationId: CONV_ID,
      table: 'message',
      counterField: 'messageCount',
      sortOrder: 0,
      errorLabel: 'AI error',
      emptyLabel: 'Empty response',
      abortController: new AbortController(),
    });

    const deltas = sseStream.events.filter((e) => {
      const parsed = JSON.parse(e.data);
      return parsed.type === 'delta';
    });
    // First chunk (300KB) is under limit and sent. Second chunk exceeds 512KB — rejected before push.
    expect(deltas.length).toBe(1);

    // The done event should include truncated: true
    const doneEvent = sseStream.events[sseStream.events.length - 1];
    const doneData = JSON.parse(doneEvent.data);
    expect(doneData.type).toBe('done');
    expect(doneData.truncated).toBe(true);

    // Verify truncated content was saved
    const messages = await getMessages();
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe(chunk300k);
  });
});
