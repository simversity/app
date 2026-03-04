import { and, count, desc, eq, gte, inArray, like, lte, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db';
import {
  conversation,
  message,
  persona,
  progress,
  scenario,
  scenarioAgent,
} from '../db/schema';
import { auditLog } from '../lib/audit';
import { ConversationStatus } from '../lib/constants';
import {
  findScenario,
  findUserConversation,
} from '../lib/conversation-helpers';
import { MIN_MESSAGES_TO_COMPLETE, RATE_LIMIT_MESSAGES } from '../lib/env';
import { parsePagination } from '../lib/pagination';
import { createRateLimiter } from '../lib/rate-limit';
import type { AppEnv } from '../lib/types';
import { parseUUID } from '../lib/validation';
import { requireVerified } from '../middleware/auth';
import { messageRoutes } from './conversation-messages';
import { observerRoutes } from './observer';

const checkConversationMutationRate = createRateLimiter(RATE_LIMIT_MESSAGES);

export const conversationRoutes = new Hono<AppEnv>();

conversationRoutes.use('*', requireVerified);

// Mount sub-routes
conversationRoutes.route('/:id/observer', observerRoutes);
conversationRoutes.route('/', messageRoutes);

conversationRoutes.get('/', async (c) => {
  const user = c.get('user');
  const { limit, offset } = parsePagination(c);
  const statusFilter = c.req.query('status');

  const search = c.req.query('search')?.trim();
  const from = c.req.query('from'); // ISO date string YYYY-MM-DD
  const to = c.req.query('to'); // ISO date string YYYY-MM-DD

  const conditions = [eq(conversation.userId, user.id)];
  if (
    statusFilter === 'active' ||
    statusFilter === 'completed' ||
    statusFilter === 'abandoned'
  ) {
    conditions.push(eq(conversation.status, statusFilter));
  }
  if (search) {
    const escapedSearch = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
    conditions.push(like(scenario.title, `%${escapedSearch}%`));
  }
  if (from) {
    conditions.push(gte(conversation.startedAt, new Date(from)));
  }
  if (to) {
    // Include the entire "to" day
    const toEnd = new Date(to);
    toEnd.setDate(toEnd.getDate() + 1);
    conditions.push(lte(conversation.startedAt, toEnd));
  }

  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: conversation.id,
        scenarioId: conversation.scenarioId,
        status: conversation.status,
        messageCount: conversation.messageCount,
        startedAt: conversation.startedAt,
        completedAt: conversation.completedAt,
        updatedAt: conversation.updatedAt,
        scenarioTitle: scenario.title,
        courseId: scenario.courseId,
      })
      .from(conversation)
      .leftJoin(scenario, eq(conversation.scenarioId, scenario.id))
      .where(where)
      .orderBy(desc(conversation.startedAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(conversation).where(where),
  ]);

  // Derive studentName from scenarioAgent → persona for each unique scenario
  const scenarioIds = [...new Set(rows.map((r) => r.scenarioId))];
  const agentRows =
    scenarioIds.length > 0
      ? await db
          .select({
            scenarioId: scenarioAgent.scenarioId,
            personaName: persona.name,
          })
          .from(scenarioAgent)
          .innerJoin(persona, eq(scenarioAgent.personaId, persona.id))
          .where(inArray(scenarioAgent.scenarioId, scenarioIds))
          .orderBy(scenarioAgent.sortOrder)
      : [];

  // Build a map of scenarioId → comma-joined persona names
  const namesByScenario = new Map<string, string[]>();
  for (const a of agentRows) {
    const arr = namesByScenario.get(a.scenarioId) || [];
    arr.push(a.personaName);
    namesByScenario.set(a.scenarioId, arr);
  }

  const conversations = rows.map((r) => ({
    ...r,
    studentName: namesByScenario.get(r.scenarioId)?.join(', ') || 'Student',
  }));

  return c.json({ conversations, total });
});

conversationRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const parsed = parseUUID(c, 'id', 'conversation');
  if ('error' in parsed) return parsed.error;
  const conversationId = parsed.id;

  const result = await db.query.conversation.findFirst({
    where: and(
      eq(conversation.id, conversationId),
      eq(conversation.userId, user.id),
    ),
    with: {
      messages: {
        orderBy: (m, { asc }) => [asc(m.sortOrder)],
        with: { agent: { columns: { name: true } } },
      },
      scenario: {
        columns: {
          observerPrompt: false,
          activityContext: false,
        },
      },
    },
  });

  if (!result) return c.json({ error: 'Conversation not found' }, 404);
  return c.json(result);
});

conversationRoutes.patch('/:id/complete', async (c) => {
  const user = c.get('user');
  if (!checkConversationMutationRate(user.id)) {
    return c.json({ error: 'Too many requests. Please try again later.' }, 429);
  }
  const parsed = parseUUID(c, 'id', 'conversation');
  if ('error' in parsed) return parsed.error;
  const conversationId = parsed.id;

  const conv = await findUserConversation(conversationId, user.id);
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);
  if (conv.status !== ConversationStatus.ACTIVE)
    return c.json({ error: 'Conversation is not active' }, 409);

  // Get scenario for courseId (needed for progress upsert)
  const sc = await findScenario(conv.scenarioId);

  const completed = await db.transaction(async (tx) => {
    // Check message count inside transaction to prevent TOCTOU race
    const [{ total }] = await tx
      .select({ total: count() })
      .from(message)
      .where(eq(message.conversationId, conversationId));

    if (total < MIN_MESSAGES_TO_COMPLETE) return 'too_few';

    const [updated] = await tx
      .update(conversation)
      .set({
        status: ConversationStatus.COMPLETED,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(conversation.id, conversationId),
          eq(conversation.status, ConversationStatus.ACTIVE),
        ),
      )
      .returning({ id: conversation.id });

    if (!updated) return false; // lost race — already completed concurrently

    if (sc) {
      await tx
        .insert(progress)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          courseId: sc.courseId,
          scenarioId: conv.scenarioId,
          status: 'completed',
          latestConversationId: conversationId,
          completedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [progress.userId, progress.scenarioId],
          set: {
            status: 'completed',
            latestConversationId: conversationId,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        });
    }
    return true;
  });

  if (completed === 'too_few') {
    return c.json(
      {
        error: 'Have at least two exchanges before ending the conversation.',
      },
      400,
    );
  }
  if (!completed) return c.json({ error: 'Conversation is not active' }, 409);
  auditLog(
    'conversation.complete',
    user.id,
    { conversationId },
    c.get('requestId'),
  );
  return c.json({ success: true });
});

conversationRoutes.patch('/:id/abandon', async (c) => {
  const user = c.get('user');
  if (!checkConversationMutationRate(user.id)) {
    return c.json({ error: 'Too many requests. Please try again later.' }, 429);
  }
  const parsed = parseUUID(c, 'id', 'conversation');
  if ('error' in parsed) return parsed.error;
  const conversationId = parsed.id;

  const conv = await findUserConversation(conversationId, user.id);
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);

  const abandoned = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(conversation)
      .set({
        status: ConversationStatus.ABANDONED,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(conversation.id, conversationId),
          eq(conversation.status, ConversationStatus.ACTIVE),
        ),
      )
      .returning({ id: conversation.id });

    if (!updated) return false;

    // Reset progress if this abandoned conversation was driving it,
    // but never downgrade a completed progress record.
    await tx
      .update(progress)
      .set({
        status: 'not_started',
        latestConversationId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(progress.userId, user.id),
          eq(progress.scenarioId, conv.scenarioId),
          eq(progress.latestConversationId, conversationId),
          ne(progress.status, 'completed'),
        ),
      );

    return true;
  });

  if (!abandoned) return c.json({ error: 'Conversation is not active' }, 409);
  auditLog(
    'conversation.abandon',
    user.id,
    { conversationId },
    c.get('requestId'),
  );
  return c.json({ success: true });
});
