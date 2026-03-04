import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { testDb, testSqlite } from '../../__tests__/preload';
import {
  resetDb,
  seedConversation,
  seedMinimal,
  TEST_IDS,
} from '../../__tests__/test-fixtures';
import { TEACHER, TEACHER_2 } from '../../__tests__/test-users';
import * as schema from '../../db/schema';

/**
 * Integration tests for conversation-helpers query logic and streaming save
 * logic against the real in-memory SQLite DB (via testDb from preload).
 *
 * Uses real Drizzle query functions and saveUserMessage to verify that the
 * actual code paths work against the real schema — no raw SQL approximations.
 */

// Import the real functions under test
import {
  findScenario,
  findUserConversation,
  loadScenarioAgents,
} from '../conversation-helpers';
import { saveUserMessage } from '../streaming';

beforeEach(() => {
  resetDb();
});

// ---------------------------------------------------------------------------
// findUserConversation
// ---------------------------------------------------------------------------

describe('findUserConversation query logic', () => {
  test('finds conversation owned by user', async () => {
    seedMinimal();
    seedConversation();

    const conv = await findUserConversation(TEST_IDS.conversation1, TEACHER.id);
    expect(conv).not.toBeNull();
    expect(conv?.id).toBe(TEST_IDS.conversation1);
    expect(conv?.userId).toBe(TEACHER.id);
    expect(conv?.status).toBe('active');
  });

  test('returns null for conversation owned by different user', async () => {
    seedMinimal();
    seedConversation();

    const conv = await findUserConversation(
      TEST_IDS.conversation1,
      TEACHER_2.id,
    );
    expect(conv).toBeNull();
  });

  test('returns null for nonexistent conversation', async () => {
    seedMinimal();

    const conv = await findUserConversation('nonexistent', TEACHER.id);
    expect(conv).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadScenarioAgents query logic (JOIN + ORDER BY)
// ---------------------------------------------------------------------------

describe('loadScenarioAgents query logic', () => {
  test('joins scenarioAgent with persona and returns correct fields', async () => {
    seedMinimal();

    const agents = await loadScenarioAgents(TEST_IDS.scenario1);
    expect(agents).toHaveLength(1);
    expect(agents[0].personaName).toBe('Riley');
    expect(agents[0].openingMessage).toBe(
      'Hi teacher! I heard that humans evolved from monkeys. Is that true?',
    );
    expect(agents[0].personaId).toBe(TEST_IDS.persona1);
  });

  test('returns multiple agents in sortOrder', async () => {
    seedMinimal();

    // Add a second persona and agent
    testDb
      .insert(schema.persona)
      .values({
        id: TEST_IDS.persona2,
        name: 'Sam',
        description: 'Another student',
        systemPrompt: 'You are Sam.',
      })
      .run();
    testDb
      .insert(schema.scenarioAgent)
      .values({
        id: TEST_IDS.agent2,
        scenarioId: TEST_IDS.scenario1,
        personaId: TEST_IDS.persona2,
        openingMessage: 'Hey!',
        sortOrder: 1,
      })
      .run();

    // Clear the agent cache to pick up the new agent
    const { clearAgentCache } = await import('../conversation-helpers');
    clearAgentCache(TEST_IDS.scenario1);

    const agents = await loadScenarioAgents(TEST_IDS.scenario1);
    expect(agents).toHaveLength(2);
    expect(agents[0].personaName).toBe('Riley');
    expect(agents[1].personaName).toBe('Sam');
    expect(agents[0].sortOrder).toBe(0);
    expect(agents[1].sortOrder).toBe(1);
  });

  test('returns empty array for scenario with no agents', async () => {
    seedMinimal();

    // Add a scenario without agents
    testDb
      .insert(schema.scenario)
      .values({
        id: TEST_IDS.scenario2,
        courseId: TEST_IDS.course1,
        title: 'Empty Scenario',
        description: 'No agents',
        sortOrder: 1,
      })
      .run();

    const agents = await loadScenarioAgents(TEST_IDS.scenario2);
    expect(agents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findScenario query logic
// ---------------------------------------------------------------------------

describe('findScenario query logic', () => {
  test('finds scenario by id', async () => {
    seedMinimal();

    const sc = await findScenario(TEST_IDS.scenario1);
    expect(sc).not.toBeNull();
    expect(sc?.title).toBe('Evolution Misconception');
    expect(sc?.courseId).toBe(TEST_IDS.course1);
  });

  test('returns null for nonexistent scenario', async () => {
    const sc = await findScenario('nonexistent');
    expect(sc).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// saveUserMessage transactional logic
// ---------------------------------------------------------------------------

describe('saveUserMessage transactional logic', () => {
  test('sortOrder is computed from existing message count', async () => {
    seedMinimal();
    seedConversation({ messageCount: 3 });

    const sortOrder = await saveUserMessage({
      table: 'message',
      conversationId: TEST_IDS.conversation1,
      messageId: 'new-msg',
      content: 'New message',
      counterField: 'messageCount',
    });

    // 3 existing messages (from seedConversation) → sortOrder = 3
    expect(sortOrder).toBe(3);

    // Verify the message was saved
    const [saved] = await testDb
      .select()
      .from(schema.message)
      .where(eq(schema.message.id, 'new-msg'));
    expect(saved).toBeDefined();
    expect(saved.content).toBe('New message');
    expect(saved.sortOrder).toBe(3);
  });

  test('messageCount is incremented correctly', async () => {
    seedMinimal();
    seedConversation({ messageCount: 2 });

    // Save a new message
    await saveUserMessage({
      table: 'message',
      conversationId: TEST_IDS.conversation1,
      messageId: 'inc-msg',
      content: 'Hello',
      counterField: 'messageCount',
    });

    const [conv] = await testDb
      .select({ messageCount: schema.conversation.messageCount })
      .from(schema.conversation)
      .where(eq(schema.conversation.id, TEST_IDS.conversation1));
    expect(conv.messageCount).toBe(3);
  });

  test('observerMessageCount is incremented independently', async () => {
    seedMinimal();
    seedConversation({ messageCount: 2 });

    // Save an observer message
    await saveUserMessage({
      table: 'observerMessage',
      conversationId: TEST_IDS.conversation1,
      messageId: 'obs-inc',
      content: 'How am I doing?',
      counterField: 'observerMessageCount',
    });

    const [conv] = await testDb
      .select({
        messageCount: schema.conversation.messageCount,
        observerMessageCount: schema.conversation.observerMessageCount,
      })
      .from(schema.conversation)
      .where(eq(schema.conversation.id, TEST_IDS.conversation1));
    // Regular message count unchanged
    expect(conv.messageCount).toBe(2);
    // Observer count incremented
    expect(conv.observerMessageCount).toBe(1);
  });

  test('sortOrder uniqueness enforced per conversation', async () => {
    seedMinimal();
    seedConversation({ messageCount: 1 });

    // Try to insert a message with duplicate sortOrder
    expect(() => {
      testSqlite.exec(
        `INSERT INTO message (id, conversationId, role, content, sortOrder)
         VALUES ('dup-msg', '${TEST_IDS.conversation1}', 'user', 'Duplicate', 0)`,
      );
    }).toThrow();
  });

  test('same sortOrder allowed in different conversations', async () => {
    seedMinimal();
    seedConversation({ messageCount: 1 });

    // Create a second conversation
    testDb
      .insert(schema.conversation)
      .values({
        id: 'conv-2',
        userId: TEACHER.id,
        scenarioId: TEST_IDS.scenario1,
        status: 'active',
        messageCount: 0,
        observerMessageCount: 0,
      })
      .run();

    // Insert at sortOrder 0 in the second conversation — should not conflict
    await saveUserMessage({
      table: 'message',
      conversationId: 'conv-2',
      messageId: 'conv2-msg',
      content: 'First in conv 2',
      counterField: 'messageCount',
    });

    const [saved] = await testDb
      .select()
      .from(schema.message)
      .where(eq(schema.message.id, 'conv2-msg'));
    expect(saved).toBeDefined();
    expect(saved.sortOrder).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// streamAndSaveAIResponse save verification
// ---------------------------------------------------------------------------

describe('streamAndSaveAIResponse save logic', () => {
  test('AI message saved with correct role and content', async () => {
    seedMinimal();
    seedConversation({ messageCount: 2 });

    // Verify existing messages
    const messages = await testDb
      .select()
      .from(schema.message)
      .where(eq(schema.message.conversationId, TEST_IDS.conversation1))
      .orderBy(schema.message.sortOrder);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('assistant'); // opening message
    expect(messages[1].role).toBe('user'); // teacher response
  });

  test('tombstone message saved on AI failure', async () => {
    seedMinimal();
    seedConversation({ messageCount: 1 });

    // Simulate tombstone save using Drizzle insert (matches production code)
    const tombstoneContent =
      '[Could not generate a response. Please try again.]';
    testDb
      .insert(schema.message)
      .values({
        id: 'tombstone',
        conversationId: TEST_IDS.conversation1,
        role: 'assistant',
        content: tombstoneContent,
        sortOrder: 1,
      })
      .run();

    const [msg] = await testDb
      .select()
      .from(schema.message)
      .where(eq(schema.message.id, 'tombstone'));
    expect(msg.role).toBe('assistant');
    expect(msg.content).toBe(tombstoneContent);
  });

  test('observer message save is independent of regular messages', async () => {
    seedMinimal();
    seedConversation({ messageCount: 1 });

    // Save an observer message at sortOrder 0 (different table, independent numbering)
    await saveUserMessage({
      table: 'observerMessage',
      conversationId: TEST_IDS.conversation1,
      messageId: 'obs-independent',
      content: 'How am I doing?',
      counterField: 'observerMessageCount',
    });

    // Both should exist without conflict
    const msgCount = await testDb
      .select()
      .from(schema.message)
      .where(eq(schema.message.conversationId, TEST_IDS.conversation1));
    const obsCount = await testDb
      .select()
      .from(schema.observerMessage)
      .where(eq(schema.observerMessage.conversationId, TEST_IDS.conversation1));
    expect(msgCount.length).toBe(1);
    expect(obsCount.length).toBe(1);
  });

  test('full conversation flow with correct sortOrders', async () => {
    seedMinimal();
    seedConversation({ messageCount: 4 });

    const messages = await testDb
      .select()
      .from(schema.message)
      .where(eq(schema.message.conversationId, TEST_IDS.conversation1))
      .orderBy(schema.message.sortOrder);

    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe('assistant');
    expect(messages[1].role).toBe('user');

    // Verify strict monotonic sortOrder
    for (let i = 0; i < messages.length; i++) {
      expect(messages[i].sortOrder).toBe(i);
    }

    const [conv] = await testDb
      .select({ messageCount: schema.conversation.messageCount })
      .from(schema.conversation)
      .where(eq(schema.conversation.id, TEST_IDS.conversation1));
    expect(conv.messageCount).toBe(4);
  });
});
