import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { openai } from '../ai/client';
import { buildScenarioBuilderPrompt } from '../ai/prompts';
import { db } from '../db';
import { course, persona, scenario, scenarioAgent } from '../db/schema';
import { clearAgentCache } from '../lib/agent-cache';
import { callAIWithRetry } from '../lib/ai-helpers';
import { env, RATE_LIMIT_MESSAGES } from '../lib/env';
import { log } from '../lib/logger';
import { createRateLimiter } from '../lib/rate-limit';
import { dailyLimitReached, tooManyRequests } from '../lib/responses';
import { checkDailyBudget } from '../lib/shared-budgets';
import { canAcceptStream } from '../lib/shutdown';
import type { AppEnv } from '../lib/types';
import { parseBody, parseUUID } from '../lib/validation';
import { requireVerified } from '../middleware/auth';

export const scenarioBuilderRoutes = new Hono<AppEnv>();

scenarioBuilderRoutes.use('*', requireVerified);

const checkRateLimit = createRateLimiter(RATE_LIMIT_MESSAGES);

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(5000),
    }),
  ),
});

scenarioBuilderRoutes.post('/chat', async (c) => {
  const user = c.get('user');

  if (!checkRateLimit(user.id)) {
    return tooManyRequests(c);
  }
  if (!checkDailyBudget(user.id)) {
    return dailyLimitReached(c);
  }

  let budgetConsumed = true;
  try {
    const result = await parseBody(c, chatSchema);
    if ('error' in result) return result.error;
    const { messages } = result.data;

    if (!canAcceptStream(user.id)) {
      return c.json(
        { error: 'Server is at capacity. Please try again shortly.' },
        503,
      );
    }

    const systemPrompt = buildScenarioBuilderPrompt();
    const chatMessages: {
      role: 'system' | 'user' | 'assistant';
      content: string;
    }[] = [{ role: 'system', content: systemPrompt }, ...messages];

    budgetConsumed = false;
    return streamSSE(c, async (stream) => {
      const abortController = new AbortController();
      stream.onAbort(() => abortController.abort());

      const aiStream = await callAIWithRetry(
        () =>
          openai.chat.completions.create(
            {
              model: env.NEARAI_MODEL,
              max_tokens: env.NEARAI_MAX_TOKENS,
              messages: chatMessages,
              stream: true as const,
            },
            { signal: abortController.signal },
          ),
        {
          stream,
          errorMessage:
            'The assistant is having trouble responding. Please try again.',
          timeoutMessage:
            'The assistant took too long to respond. Please try again.',
          rateLimitMessage:
            'Too many requests to the AI service. Please wait a moment.',
          logContext: { userId: user.id },
          logLabel: 'Scenario builder AI call failed',
        },
      );
      if (!aiStream) {
        checkDailyBudget.release(user.id);
        return;
      }

      const chunks: string[] = [];
      try {
        for await (const chunk of aiStream) {
          if (stream.aborted) {
            abortController.abort();
            return;
          }

          let text: string | undefined | null;
          const raw = chunk as unknown as Record<string, unknown>;

          if (chunk.choices?.[0]) {
            text = chunk.choices[0].delta?.content;
          } else if (raw.type === 'content_block_delta') {
            const delta = raw.delta as { text?: string } | undefined;
            text = delta?.text;
          } else {
            continue;
          }

          if (text) {
            chunks.push(text);
            await stream.writeSSE({
              data: JSON.stringify({ type: 'delta', text }),
              event: 'message',
            });
          }
        }
      } catch (err) {
        if (stream.aborted) return;
        log.error(
          { userId: user.id, error: err instanceof Error ? err.message : err },
          'Scenario builder stream error',
        );
        checkDailyBudget.release(user.id);
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'error',
            message: 'The assistant had trouble responding. Please try again.',
          }),
          event: 'message',
        });
        return;
      }

      const fullResponse = chunks.join('');
      if (!fullResponse.trim()) {
        checkDailyBudget.release(user.id);
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'error',
            message:
              'The assistant could not generate a response. Please try again.',
          }),
          event: 'message',
        });
        return;
      }

      await stream.writeSSE({
        data: JSON.stringify({ type: 'done' }),
        event: 'message',
      });
    });
  } finally {
    if (budgetConsumed) checkDailyBudget.release(user.id);
  }
});

const studentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  systemPrompt: z.string().min(1).max(10000),
  openingMessage: z.string().min(1).max(2000),
});

const createSchema = z.object({
  subject: z.string().min(1).max(200),
  gradeLevel: z.string().max(100).optional(),
  scenarioTitle: z.string().min(1).max(300),
  scenarioDescription: z.string().min(1).max(2000),
  activityContext: z.string().max(500).optional(),
  students: z.array(studentSchema).min(1).max(6),
});

scenarioBuilderRoutes.post('/create', async (c) => {
  const user = c.get('user');

  if (!checkRateLimit(user.id)) {
    return tooManyRequests(c);
  }

  const result = await parseBody(c, createSchema);
  if ('error' in result) return result.error;
  const data = result.data;

  try {
    const courseId = crypto.randomUUID();
    const scenarioId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(course).values({
        id: courseId,
        title: data.scenarioTitle,
        description: data.scenarioDescription,
        subject: data.subject,
        gradeLevel: data.gradeLevel || 'Undergraduate',
        visibility: 'private',
        createdBy: user.id,
        scenarioCount: 1,
      });

      const personaIds: string[] = [];
      for (const student of data.students) {
        const personaId = crypto.randomUUID();
        personaIds.push(personaId);
        await tx.insert(persona).values({
          id: personaId,
          name: student.name,
          description: student.description,
          systemPrompt: student.systemPrompt,
          createdBy: user.id,
        });
      }

      await tx.insert(scenario).values({
        id: scenarioId,
        courseId,
        title: data.scenarioTitle,
        description: data.scenarioDescription,
        activityContext: data.activityContext || null,
        createdBy: user.id,
        sortOrder: 0,
      });

      for (let i = 0; i < data.students.length; i++) {
        await tx.insert(scenarioAgent).values({
          id: crypto.randomUUID(),
          scenarioId,
          personaId: personaIds[i],
          openingMessage: data.students[i].openingMessage,
          sortOrder: i,
        });
      }
    });

    return c.json({ courseId, scenarioId }, 201);
  } catch (err) {
    log.error(
      { userId: user.id, error: err instanceof Error ? err.message : err },
      'Failed to create scenario from builder',
    );
    return c.json({ error: 'Failed to create scenario' }, 500);
  }
});

// GET /api/scenario-builder/:scenarioId — Load user-created scenario for editing
scenarioBuilderRoutes.get('/:scenarioId', async (c) => {
  const user = c.get('user');
  const parsed = parseUUID(c, 'scenarioId', 'scenario');
  if ('error' in parsed) return parsed.error;

  const s = await db.query.scenario.findFirst({
    where: eq(scenario.id, parsed.id),
    with: {
      course: {
        columns: {
          id: true,
          title: true,
          subject: true,
          gradeLevel: true,
          visibility: true,
          createdBy: true,
        },
      },
      agents: {
        with: { persona: true },
        orderBy: (a, { asc }) => [asc(a.sortOrder)],
      },
    },
  });

  if (!s) return c.json({ error: 'Scenario not found' }, 404);
  if (s.course.createdBy !== user.id || s.course.visibility !== 'private') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  return c.json({
    scenarioId: s.id,
    courseId: s.course.id,
    scenarioTitle: s.title,
    scenarioDescription: s.description,
    subject: s.course.subject,
    gradeLevel: s.course.gradeLevel,
    activityContext: s.activityContext,
    students: s.agents.map((a) => ({
      personaId: a.personaId,
      name: a.persona.name,
      description: a.persona.description,
      systemPrompt: a.persona.systemPrompt,
      openingMessage: a.openingMessage ?? '',
    })),
  });
});

const updateSchema = z.object({
  scenarioTitle: z.string().min(1).max(300).optional(),
  scenarioDescription: z.string().min(1).max(2000).optional(),
  subject: z.string().min(1).max(200).optional(),
  gradeLevel: z.string().max(100).optional(),
  activityContext: z.string().max(500).optional(),
  students: z
    .array(
      z.object({
        personaId: z.string().uuid(),
        name: z.string().min(1).max(100),
        description: z.string().min(1).max(1000),
        systemPrompt: z.string().min(1).max(10000),
        openingMessage: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(6)
    .optional(),
});

// PATCH /api/scenario-builder/:scenarioId — Update user-created scenario
scenarioBuilderRoutes.patch('/:scenarioId', async (c) => {
  const user = c.get('user');
  const parsed = parseUUID(c, 'scenarioId', 'scenario');
  if ('error' in parsed) return parsed.error;
  const scenarioId = parsed.id;

  if (!checkRateLimit(user.id)) {
    return tooManyRequests(c);
  }

  const result = await parseBody(c, updateSchema);
  if ('error' in result) return result.error;
  const data = result.data;

  // Verify ownership and load agents for persona validation
  const s = await db.query.scenario.findFirst({
    where: eq(scenario.id, scenarioId),
    with: {
      course: { columns: { id: true, visibility: true, createdBy: true } },
      agents: { columns: { personaId: true } },
    },
  });

  if (!s) return c.json({ error: 'Scenario not found' }, 404);
  if (s.course.createdBy !== user.id || s.course.visibility !== 'private') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Validate that all submitted persona IDs belong to this scenario
  const validPersonaIds = new Set(s.agents.map((a) => a.personaId));
  if (data.students) {
    for (const student of data.students) {
      if (!validPersonaIds.has(student.personaId)) {
        return c.json({ error: 'Invalid persona ID' }, 400);
      }
    }
  }

  try {
    await db.transaction(async (tx) => {
      // Update scenario
      if (
        data.scenarioTitle ||
        data.scenarioDescription ||
        data.activityContext !== undefined
      ) {
        const scenarioUpdate: Record<string, unknown> = {};
        if (data.scenarioTitle) scenarioUpdate.title = data.scenarioTitle;
        if (data.scenarioDescription)
          scenarioUpdate.description = data.scenarioDescription;
        if (data.activityContext !== undefined)
          scenarioUpdate.activityContext = data.activityContext || null;
        await tx
          .update(scenario)
          .set(scenarioUpdate)
          .where(eq(scenario.id, scenarioId));
      }

      // Update course metadata (title mirrors scenario for user-created)
      const courseUpdate: Record<string, unknown> = {};
      if (data.scenarioTitle) courseUpdate.title = data.scenarioTitle;
      if (data.scenarioDescription)
        courseUpdate.description = data.scenarioDescription;
      if (data.subject) courseUpdate.subject = data.subject;
      if (data.gradeLevel) courseUpdate.gradeLevel = data.gradeLevel;
      if (Object.keys(courseUpdate).length > 0) {
        await tx
          .update(course)
          .set(courseUpdate)
          .where(eq(course.id, s.course.id));
      }

      // Update students (personas + agents)
      if (data.students) {
        for (const student of data.students) {
          await tx
            .update(persona)
            .set({
              name: student.name,
              description: student.description,
              systemPrompt: student.systemPrompt,
            })
            .where(eq(persona.id, student.personaId));

          await tx
            .update(scenarioAgent)
            .set({ openingMessage: student.openingMessage })
            .where(
              and(
                eq(scenarioAgent.scenarioId, scenarioId),
                eq(scenarioAgent.personaId, student.personaId),
              ),
            );
        }
      }
    });

    clearAgentCache();
    return c.json({ success: true });
  } catch (err) {
    log.error(
      { userId: user.id, error: err instanceof Error ? err.message : err },
      'Failed to update scenario',
    );
    return c.json({ error: 'Failed to update scenario' }, 500);
  }
});
