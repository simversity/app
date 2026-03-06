import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { openai } from '../ai/client';
import { buildScenarioBuilderPrompt } from '../ai/prompts';
import { db } from '../db';
import { course, persona, scenario, scenarioAgent } from '../db/schema';
import { callAIWithRetry } from '../lib/ai-helpers';
import { env, RATE_LIMIT_MESSAGES } from '../lib/env';
import { log } from '../lib/logger';
import { createRateLimiter } from '../lib/rate-limit';
import { checkDailyBudget } from '../lib/shared-budgets';
import { canAcceptStream } from '../lib/shutdown';
import type { AppEnv } from '../lib/types';
import { parseBody } from '../lib/validation';
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
        checkDailyBudget?.release(user.id);
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
        checkDailyBudget?.release(user.id);
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
        checkDailyBudget?.release(user.id);
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
    if (budgetConsumed) checkDailyBudget?.release(user.id);
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
    return c.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      429,
    );
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
