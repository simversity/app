import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { db } from '../db';
import { conversation, course, message, progress } from '../db/schema';
import { ConversationStatus, ErrorCode } from '../lib/constants';
import {
  buildChatContext,
  detectAddressedAgents,
  findScenario,
  findUserConversation,
  loadScenarioAgents,
} from '../lib/conversation-helpers';
import {
  MAX_MESSAGE_CHARS,
  MAX_MESSAGES_PER_CONVERSATION,
  RATE_LIMIT_MESSAGES,
  RATE_LIMIT_START_CONVERSATION,
} from '../lib/env';
import { log } from '../lib/logger';
import {
  handleInlineNudge,
  handleMultiAgentResponse,
  handleSingleAgentResponse,
} from '../lib/message-handlers';
import { createRateLimiter } from '../lib/rate-limit';
import { checkDailyBudget } from '../lib/shared-budgets';
import { canAcceptStream } from '../lib/shutdown';
import { saveUserMessage } from '../lib/streaming';
import type { AppEnv } from '../lib/types';
import { parseBody, parseUUID } from '../lib/validation';

const startConversationSchema = z.object({
  scenarioId: z.string().uuid(),
});

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
});

export const messageRoutes = new Hono<AppEnv>();

const checkRateLimit = createRateLimiter(RATE_LIMIT_MESSAGES);
const checkStartRate = createRateLimiter(RATE_LIMIT_START_CONVERSATION);

messageRoutes.post('/', async (c) => {
  const user = c.get('user');

  if (!checkStartRate(user.id)) {
    return c.json({ error: 'Rate limit exceeded. Please slow down.' }, 429);
  }

  const result = await parseBody(c, startConversationSchema);
  if ('error' in result) return result.error;
  const { scenarioId } = result.data;

  const sc = await findScenario(scenarioId);
  if (!sc) return c.json({ error: 'Scenario not found' }, 404);

  // Verify course is published (teachers should not start conversations on private/archived courses)
  const [parentCourse] = await db
    .select({ visibility: course.visibility })
    .from(course)
    .where(eq(course.id, sc.courseId));
  if (!parentCourse || parentCourse.visibility !== 'published') {
    return c.json({ error: 'Course not available' }, 403);
  }

  // Return existing active conversation instead of creating a duplicate
  const [existing] = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(
      and(
        eq(conversation.userId, user.id),
        eq(conversation.scenarioId, scenarioId),
        eq(conversation.status, ConversationStatus.ACTIVE),
      ),
    );
  if (existing) {
    const agents = await loadScenarioAgents(scenarioId);
    const existingMessages = await db
      .select()
      .from(message)
      .where(eq(message.conversationId, existing.id))
      .orderBy(message.sortOrder);
    const messagesWithAgentNames = existingMessages.map((msg) => {
      const agent = agents.find((a) => a.personaId === msg.agentId);
      return { ...msg, agentName: agent?.personaName || null };
    });
    return c.json(
      { conversation: existing, messages: messagesWithAgentNames },
      200,
    );
  }

  // Load scenario agents with their personas
  const agents = await loadScenarioAgents(scenarioId);

  const convId = crypto.randomUUID();
  const openingMessages: {
    id: string;
    conversationId: string;
    role: string;
    content: string;
    agentId: string | null;
    sortOrder: number;
  }[] = [];

  if (agents.length > 0) {
    let sortIdx = 0;
    for (const agent of agents) {
      if (agent.openingMessage) {
        openingMessages.push({
          id: crypto.randomUUID(),
          conversationId: convId,
          role: 'assistant',
          content: agent.openingMessage,
          agentId: agent.personaId,
          sortOrder: sortIdx++,
        });
      }
    }
  }

  if (openingMessages.length === 0) {
    return c.json(
      { error: 'Scenario has no opening messages configured' },
      422,
    );
  }

  const conv = {
    id: convId,
    userId: user.id,
    scenarioId: sc.id,
    status: ConversationStatus.ACTIVE,
    messageCount: openingMessages.length,
  };

  await db.transaction(async (tx) => {
    await tx.insert(conversation).values(conv);
    for (const msg of openingMessages) {
      await tx.insert(message).values(msg);
    }
  });

  const messagesWithAgentNames = openingMessages.map((msg) => {
    const agent = agents.find((a) => a.personaId === msg.agentId);
    return { ...msg, agentName: agent?.personaName || null };
  });

  return c.json({ conversation: conv, messages: messagesWithAgentNames }, 201);
});

messageRoutes.post('/:id/messages', async (c) => {
  const user = c.get('user');

  if (!checkRateLimit(user.id)) {
    return c.json({ error: 'Rate limit exceeded. Please slow down.' }, 429);
  }
  if (checkDailyBudget && !checkDailyBudget(user.id)) {
    return c.json(
      { error: 'Daily message limit reached. Please try again tomorrow.' },
      429,
    );
  }

  let budgetConsumed = true;
  try {
    const parsed = parseUUID(c, 'id', 'conversation');
    if ('error' in parsed) return parsed.error;
    const conversationId = parsed.id;
    const result = await parseBody(c, sendMessageSchema);
    if ('error' in result) return result.error;
    const { content } = result.data;

    const conv = await findUserConversation(conversationId, user.id);
    if (!conv) return c.json({ error: 'Conversation not found' }, 404);
    if (conv.status !== ConversationStatus.ACTIVE)
      return c.json({ error: 'Conversation is not active' }, 409);
    if (conv.messageCount >= MAX_MESSAGES_PER_CONVERSATION) {
      return c.json(
        {
          error:
            'Conversation has reached the maximum number of messages. Please complete it and start a new one.',
        },
        400,
      );
    }

    const ctx = await buildChatContext({
      conversationId,
      scenarioId: conv.scenarioId,
      userContent: content,
    });
    if ('error' in ctx) return c.json({ error: ctx.error }, ctx.status);

    const {
      scenario: sc,
      resolvedModel,
      chatMessages,
      agentPersonaId,
      agentPersonaName,
      agents,
      recentMessages,
    } = ctx;

    if (!canAcceptStream(user.id)) {
      return c.json(
        { error: 'Server is at capacity. Please try again shortly.' },
        503,
      );
    }

    // Re-check status inside transaction to prevent TOCTOU race
    const teacherMsgId = crypto.randomUUID();
    let teacherSortOrder: number;
    try {
      teacherSortOrder = await saveUserMessage({
        table: 'message',
        conversationId,
        messageId: teacherMsgId,
        content,
        counterField: 'messageCount',
        extra: { agentId: null },
        preCheck: async (tx) => {
          const [row] = await tx
            .select({
              status: conversation.status,
              messageCount: conversation.messageCount,
            })
            .from(conversation)
            .where(eq(conversation.id, conversationId));
          if (row?.status !== ConversationStatus.ACTIVE) {
            throw new Error(ErrorCode.CONVERSATION_NOT_ACTIVE);
          }
          // Reserve room for the teacher message + all agent responses
          const messagesNeeded = 1 + agents.length;
          if (
            (row?.messageCount ?? 0) + messagesNeeded >
            MAX_MESSAGES_PER_CONVERSATION
          ) {
            throw new Error(ErrorCode.MESSAGE_LIMIT_REACHED);
          }
        },
      });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === ErrorCode.CONVERSATION_NOT_ACTIVE)
          return c.json({ error: 'Conversation is not active' }, 409);
        if (err.message === ErrorCode.MESSAGE_LIMIT_REACHED)
          return c.json(
            {
              error:
                'Conversation has reached the maximum number of messages. Please complete it and start a new one.',
            },
            400,
          );
      }
      log.error(
        {
          conversationId,
          userId: user.id,
          error: err instanceof Error ? err.message : err,
        },
        'Failed to save teacher message',
      );
      return c.json({ error: 'Failed to save message' }, 500);
    }

    const isMultiAgent = agents.length > 1;

    // Progress upsert shared by both single- and multi-agent paths
    const upsertProgress = async (
      tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    ) => {
      await tx
        .insert(progress)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          courseId: sc.courseId,
          scenarioId: conv.scenarioId,
          status: 'in_progress',
          latestConversationId: conversationId,
        })
        .onConflictDoUpdate({
          target: [progress.userId, progress.scenarioId],
          set: {
            latestConversationId: conversationId,
            updatedAt: new Date(),
          },
        });
    };

    if (!isMultiAgent) {
      budgetConsumed = false;
      return streamSSE(c, async (stream) => {
        await handleSingleAgentResponse({
          stream,
          resolvedModel,
          chatMessages,
          conversationId,
          teacherSortOrder,
          agentPersonaId,
          agentPersonaName,
          userId: user.id,
          afterSave: upsertProgress,
        });
      });
    }

    const respondingAgents = detectAddressedAgents(content, agents) ?? agents;

    budgetConsumed = false;
    return streamSSE(c, async (stream) => {
      const { turnResponses, nextSortOrder } = await handleMultiAgentResponse({
        stream,
        respondingAgents,
        agents,
        resolvedModel,
        recentMessages,
        content,
        conversationId,
        teacherSortOrder,
        userId: user.id,
        afterSave: upsertProgress,
      });

      await handleInlineNudge({
        stream,
        sc,
        agents,
        respondingAgents,
        recentMessages,
        content,
        turnResponses,
        nextSortOrder,
        resolvedModel,
      });
    });
  } finally {
    if (budgetConsumed) checkDailyBudget?.release(user.id);
  }
});
