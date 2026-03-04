import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { openai } from '../ai/client';
import { getContextLimit } from '../ai/models';
import { buildObserverContext, escapeXml } from '../ai/prompts';
import { db } from '../db';
import { conversation, message, observerMessage, persona } from '../db/schema';
import { callAIWithRetry } from '../lib/ai-helpers';
import { ConversationStatus, ErrorCode, ErrorMessage } from '../lib/constants';
import {
  findScenario,
  findUserConversation,
  loadScenarioAgents,
  resolveModel,
} from '../lib/conversation-helpers';
import {
  env,
  MAX_CONTEXT_MESSAGES,
  MAX_MESSAGE_CHARS,
  MAX_OBSERVER_CONTEXT,
  MID_CONVERSATION_MAX_TOKENS,
  POST_CONVERSATION_MAX_TOKENS,
  RATE_LIMIT_OBSERVER,
} from '../lib/env';
import { log } from '../lib/logger';
import { isModelAllowed } from '../lib/model-check';
import { createRateLimiter } from '../lib/rate-limit';
import { checkDailyBudget } from '../lib/shared-budgets';
import { canAcceptStream } from '../lib/shutdown';
import { saveUserMessage, streamAndSaveAIResponse } from '../lib/streaming';
import { trimMessagesToFit } from '../lib/token-estimate';
import type { AppEnv } from '../lib/types';
import { escapeRegex, parseBody, parseUUID } from '../lib/validation';
import { requireVerified } from '../middleware/auth';

const sendObserverMessageSchema = z.object({
  content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
});

export const observerRoutes = new Hono<AppEnv>();

observerRoutes.use('*', requireVerified);

const checkObserverRateLimit = createRateLimiter(RATE_LIMIT_OBSERVER);
observerRoutes.get('/', async (c) => {
  const user = c.get('user');
  const parsed = parseUUID(c, 'id', 'conversation');
  if ('error' in parsed) return parsed.error;
  const conversationId = parsed.id;

  // Verify conversation belongs to user
  const conv = await findUserConversation(conversationId, user.id);
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);

  const messages = await db
    .select()
    .from(observerMessage)
    .where(eq(observerMessage.conversationId, conversationId))
    .orderBy(observerMessage.sortOrder);

  return c.json({ messages, total: messages.length });
});

observerRoutes.post('/', async (c) => {
  const user = c.get('user');
  const budget = checkDailyBudget;

  if (!checkObserverRateLimit(user.id)) {
    return c.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      429,
    );
  }
  if (checkDailyBudget && !checkDailyBudget(user.id)) {
    return c.json(
      { error: 'Daily message limit reached. Please try again tomorrow.' },
      429,
    );
  }

  let budgetConsumed = true;
  try {
    const parsedId = parseUUID(c, 'id', 'conversation');
    if ('error' in parsedId) return parsedId.error;
    const conversationId = parsedId.id;
    const result = await parseBody(c, sendObserverMessageSchema);
    if ('error' in result) return result.error;
    const { content } = result.data;

    // Verify conversation belongs to user. Observer feedback is allowed on both
    // active (mid-conversation) and completed (post-conversation) conversations;
    // only abandoned conversations are blocked.
    const conv = await findUserConversation(conversationId, user.id);
    if (!conv) return c.json({ error: 'Conversation not found' }, 404);
    if (conv.status === ConversationStatus.ABANDONED)
      return c.json({ error: 'Conversation has been abandoned' }, 409);

    // Fetch scenario, agents, transcript, and observer history in parallel
    const [sc, agents, transcript, existingObserverMessages] =
      await Promise.all([
        findScenario(conv.scenarioId),
        loadScenarioAgents(conv.scenarioId),
        db
          .select({
            role: message.role,
            content: message.content,
            agentId: message.agentId,
            sortOrder: message.sortOrder,
            agentName: persona.name,
          })
          .from(message)
          .leftJoin(persona, eq(message.agentId, persona.id))
          .where(eq(message.conversationId, conversationId))
          .orderBy(desc(message.sortOrder))
          .limit(MAX_CONTEXT_MESSAGES)
          .then((rows) => rows.reverse()),
        db
          .select()
          .from(observerMessage)
          .where(eq(observerMessage.conversationId, conversationId))
          .orderBy(desc(observerMessage.sortOrder))
          .limit(MAX_OBSERVER_CONTEXT)
          .then((rows) => rows.reverse()),
      ]);
    if (!sc) return c.json({ error: 'Scenario not found' }, 404);

    const resolvedModel = resolveModel(sc, 'observer');
    if (!isModelAllowed(resolvedModel)) {
      return c.json({ error: 'Model not available' }, 400);
    }

    const agentNames =
      agents.length > 0 ? agents.map((a) => a.personaName) : ['Student'];

    // Compute addressing/participation stats for group scenarios
    const addressingStats =
      agents.length > 1
        ? agents.map((agent) => {
            const agentTurns = transcript.filter(
              (m) => m.role === 'assistant' && m.agentId === agent.personaId,
            ).length;
            const nameLower = agent.personaName.toLowerCase();
            const namePattern = new RegExp(`\\b${escapeRegex(nameLower)}\\b`);
            const teacherMentions = transcript.filter(
              (m) =>
                m.role === 'user' && namePattern.test(m.content.toLowerCase()),
            ).length;
            return {
              name: agent.personaName,
              agentTurns,
              teacherMentions,
            };
          })
        : undefined;

    // Build observer context
    const chatMessages = buildObserverContext({
      observerPrompt: sc.observerPrompt,
      scenarioTitle: sc.title,
      agentNames,
      transcript: transcript.map((m) => ({
        role: m.role,
        content: m.content,
        agentName:
          m.role === 'assistant'
            ? m.agentName || agentNames[0] || undefined
            : undefined,
      })),
      previousObserverMessages: existingObserverMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      mode:
        conv.status === ConversationStatus.ACTIVE
          ? 'mid-conversation'
          : 'post-conversation',
      addressingStats,
    });

    // Append the teacher's new question (wrapped in XML to prevent prompt injection)
    chatMessages.push({
      role: 'user',
      content: `<teacher-question>${escapeXml(content)}</teacher-question>`,
    });

    if (!canAcceptStream(user.id)) {
      return c.json(
        { error: 'Server is at capacity. Please try again shortly.' },
        503,
      );
    }

    const teacherMsgId = crypto.randomUUID();
    let teacherSortOrder: number;
    try {
      teacherSortOrder = await saveUserMessage({
        table: 'observerMessage',
        conversationId,
        messageId: teacherMsgId,
        content,
        counterField: 'observerMessageCount',
        preCheck: async (tx) => {
          const [row] = await tx
            .select({ status: conversation.status })
            .from(conversation)
            .where(eq(conversation.id, conversationId));
          if (row?.status === ConversationStatus.ABANDONED) {
            throw new Error(ErrorCode.CONVERSATION_ABANDONED);
          }
        },
      });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === ErrorCode.CONVERSATION_ABANDONED)
          return c.json({ error: 'Conversation has been abandoned' }, 409);
      }
      log.error(
        {
          conversationId,
          userId: user.id,
          error: err instanceof Error ? err.message : err,
        },
        'Failed to save observer teacher message',
      );
      return c.json({ error: 'Failed to save message' }, 500);
    }

    // Trim context if estimated tokens exceed a safe threshold
    const maxTokens =
      conv.status === ConversationStatus.ACTIVE
        ? Math.min(env.NEARAI_MAX_TOKENS, MID_CONVERSATION_MAX_TOKENS)
        : POST_CONVERSATION_MAX_TOKENS;
    const trimmedMessages = trimMessagesToFit(
      chatMessages,
      getContextLimit(resolvedModel) - maxTokens,
    );

    // Stream the AI response
    budgetConsumed = false;
    return streamSSE(c, async (stream) => {
      const abortController = new AbortController();
      stream.onAbort(() => abortController.abort());

      const aiStream = await callAIWithRetry(
        () =>
          openai.chat.completions.create(
            {
              model: resolvedModel,
              max_tokens: maxTokens,
              messages: trimmedMessages,
              stream: true as const,
            },
            { signal: abortController.signal },
          ),
        {
          stream,
          errorMessage: ErrorMessage.OBSERVER_TROUBLE,
          timeoutMessage: ErrorMessage.OBSERVER_TIMEOUT,
          rateLimitMessage: ErrorMessage.OBSERVER_RATE_LIMITED,
          logContext: { conversationId, userId: user.id },
          logLabel: 'Observer AI call failed after retries',
        },
      );
      if (!aiStream) {
        budget?.release(user.id);
        return;
      }

      await streamAndSaveAIResponse({
        stream,
        aiStream,
        conversationId,
        table: 'observerMessage',
        counterField: 'observerMessageCount',
        sortOrder: teacherSortOrder + 1,
        errorLabel: ErrorMessage.OBSERVER_TROUBLE,
        emptyLabel: ErrorMessage.OBSERVER_EMPTY,
        abortController,
        userId: user.id,
        onAIFailure: budget ? () => budget.release(user.id) : undefined,
      });
    });
  } finally {
    if (budgetConsumed) checkDailyBudget?.release(user.id);
  }
});
