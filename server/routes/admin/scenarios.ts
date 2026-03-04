import { count, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { fetchModels } from '../../ai/models';
import { db } from '../../db';
import {
  conversation,
  course,
  persona,
  scenario,
  scenarioAgent,
} from '../../db/schema';
import { auditLog } from '../../lib/audit';
import { clearAgentCache } from '../../lib/conversation-helpers';
import { log } from '../../lib/logger';
import { isModelAllowed } from '../../lib/model-check';
import { parsePagination } from '../../lib/pagination';
import type { AppEnv } from '../../lib/types';
import { buildUpdateSet } from '../../lib/utils';
import { hasUpdateFields, parseBody, parseUUID } from '../../lib/validation';

const agentSchema = z.object({
  personaId: z.string().min(1),
  openingMessage: z.string().max(5000).optional(),
  sortOrder: z.number().int().min(0).optional(),
  maxResponseTokens: z.number().int().min(1).max(4096).nullable().optional(),
});

const observerModeEnum = z.enum(['panel', 'inline', 'both']);

const createScenarioSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  observerPrompt: z.string().max(10000).optional(),
  activityContext: z.string().max(10000).optional(),
  observerMode: observerModeEnum.optional(),
  agents: z.array(agentSchema).optional(),
});

const updateScenarioSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().min(1).max(5000).optional(),
  observerPrompt: z.string().max(10000).nullable().optional(),
  activityContext: z.string().max(10000).nullable().optional(),
  observerMode: observerModeEnum.optional(),
  model: z.string().min(1).max(200).nullable().optional(),
  observerModel: z.string().min(1).max(200).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  agents: z.array(agentSchema).optional(),
});

/** Validate that all persona IDs exist. Returns missing IDs, or empty array if all valid. */
async function findMissingPersonaIds(personaIds: string[]): Promise<string[]> {
  if (personaIds.length === 0) return [];
  const existing = await db
    .select({ id: persona.id })
    .from(persona)
    .where(inArray(persona.id, personaIds));
  const existingIds = new Set(existing.map((p) => p.id));
  return personaIds.filter((pid) => !existingIds.has(pid));
}

/** Validate that agents list is non-empty, has at least one opening message, and all personaIds exist. */
async function validateScenarioAgents(
  agents: z.infer<typeof agentSchema>[],
): Promise<{ error: string; status: 400 } | null> {
  if (!agents.length) {
    return { error: 'At least one student persona is required', status: 400 };
  }
  if (!agents.some((a) => a.openingMessage?.trim())) {
    return {
      error: 'At least one student must have an opening message',
      status: 400,
    };
  }
  const missing = await findMissingPersonaIds(agents.map((a) => a.personaId));
  if (missing.length > 0) {
    return {
      error: `One or more persona IDs not found (${missing.length} invalid)`,
      status: 400,
    };
  }
  return null;
}

export const adminScenarioRoutes = new Hono<AppEnv>();

/** Top-level scenario routes for single-resource operations (GET/PATCH/DELETE by ID).
 *  These don't require courseId and are mounted at /api/admin/scenarios. */
export const adminScenarioByIdRoutes = new Hono<AppEnv>();

adminScenarioRoutes.get('/', async (c) => {
  const parsed = parseUUID(c, 'courseId', 'course');
  if ('error' in parsed) return parsed.error;
  const courseId = parsed.id;

  // Verify course exists
  const [targetCourse] = await db
    .select({ id: course.id })
    .from(course)
    .where(eq(course.id, courseId));
  if (!targetCourse) return c.json({ error: 'Course not found' }, 404);

  const { limit, offset } = parsePagination(c);

  const [scenarios, [{ total }]] = await Promise.all([
    db.query.scenario.findMany({
      where: eq(scenario.courseId, courseId),
      orderBy: (s, { asc }) => [asc(s.sortOrder)],
      limit,
      offset,
      with: {
        agents: {
          with: { persona: { columns: { id: true, name: true } } },
          orderBy: (a, { asc }) => [asc(a.sortOrder)],
        },
      },
    }),
    db
      .select({ total: count() })
      .from(scenario)
      .where(eq(scenario.courseId, courseId)),
  ]);

  return c.json({ scenarios, total });
});

adminScenarioRoutes.post('/', async (c) => {
  const parsedCourse = parseUUID(c, 'courseId', 'course');
  if ('error' in parsedCourse) return parsedCourse.error;
  const courseId = parsedCourse.id;
  const result = await parseBody(c, createScenarioSchema);
  if ('error' in result) return result.error;
  const {
    title,
    description,
    observerPrompt,
    activityContext,
    observerMode,
    agents: agentsList,
  } = result.data;

  const [targetCourse] = await db
    .select({ id: course.id })
    .from(course)
    .where(eq(course.id, courseId));

  if (!targetCourse) {
    return c.json({ error: 'Course not found' }, 404);
  }

  const currentUser = c.get('user');
  const id = crypto.randomUUID();

  if (!agentsList?.length) {
    return c.json({ error: 'At least one student persona is required' }, 400);
  }
  const agentError = await validateScenarioAgents(agentsList);
  if (agentError) return c.json({ error: agentError.error }, agentError.status);

  const [created] = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(scenario)
      .values({
        id,
        courseId,
        title,
        description,
        observerPrompt: observerPrompt || null,
        activityContext: activityContext || null,
        observerMode: observerMode || 'panel',
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
      })
      .returning();

    if (agentsList?.length) {
      await tx.insert(scenarioAgent).values(
        agentsList.map((a, i) => ({
          scenarioId: id,
          personaId: a.personaId,
          openingMessage: a.openingMessage || null,
          sortOrder: a.sortOrder ?? i,
          maxResponseTokens: a.maxResponseTokens ?? null,
        })),
      );
    }

    // IMPORTANT: course.scenarioCount is denormalized. Any code path that
    // creates or deletes scenarios must update this counter in the same
    // transaction. See also the DELETE handler below.
    await tx
      .update(course)
      .set({ scenarioCount: sql`${course.scenarioCount} + 1` })
      .where(eq(course.id, courseId));

    return [row];
  });

  auditLog(
    'scenario.create',
    currentUser.id,
    { scenarioId: id, courseId },
    c.get('requestId'),
  );
  return c.json({ scenario: created }, 201);
});

adminScenarioByIdRoutes.get('/:id', async (c) => {
  const parsed = parseUUID(c, 'id', 'scenario');
  if ('error' in parsed) return parsed.error;
  const { id } = parsed;

  const result = await db.query.scenario.findFirst({
    where: eq(scenario.id, id),
    with: {
      agents: {
        with: { persona: { columns: { id: true, name: true } } },
        orderBy: (a, { asc }) => [asc(a.sortOrder)],
      },
    },
  });

  if (!result) {
    return c.json({ error: 'Scenario not found' }, 404);
  }

  return c.json({ scenario: result });
});

adminScenarioByIdRoutes.patch('/:id', async (c) => {
  const parsed = parseUUID(c, 'id', 'scenario');
  if ('error' in parsed) return parsed.error;
  const { id } = parsed;
  const result = await parseBody(c, updateScenarioSchema);
  if ('error' in result) return result.error;
  const {
    title,
    description,
    observerPrompt,
    activityContext,
    observerMode,
    model,
    observerModel,
    sortOrder,
    agents,
  } = result.data;

  if (!hasUpdateFields(result.data)) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  const [target] = await db
    .select({ id: scenario.id })
    .from(scenario)
    .where(eq(scenario.id, id));

  if (!target) {
    return c.json({ error: 'Scenario not found' }, 404);
  }

  // Validate model IDs against available models
  if (model || observerModel) {
    let available: { id: string }[];
    try {
      available = await fetchModels();
    } catch (err) {
      log.error(
        { error: err instanceof Error ? err.message : err },
        'Failed to fetch model list',
      );
      return c.json(
        { error: 'Unable to validate model — AI provider unavailable' },
        502,
      );
    }
    const validIds = new Set(available.map((m) => m.id));
    if (model && !validIds.has(model)) {
      return c.json({ error: 'Unknown model ID' }, 400);
    }
    if (observerModel && !validIds.has(observerModel)) {
      return c.json({ error: 'Unknown observer model ID' }, 400);
    }
    if (model && !isModelAllowed(model)) {
      return c.json({ error: 'Model not permitted by allowlist' }, 400);
    }
    if (observerModel && !isModelAllowed(observerModel)) {
      return c.json(
        { error: 'Observer model not permitted by allowlist' },
        400,
      );
    }
  }

  const currentUser = c.get('user');

  if (agents) {
    const agentError = await validateScenarioAgents(agents);
    if (agentError)
      return c.json({ error: agentError.error }, agentError.status);
  }

  const scenarioUpdates = buildUpdateSet(
    {
      title,
      description,
      observerPrompt,
      activityContext,
      observerMode,
      model,
      observerModel,
      sortOrder,
    },
    currentUser.id,
  );

  const [updated] = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(scenario)
      .set(scenarioUpdates)
      .where(eq(scenario.id, id))
      .returning();

    // Replace agents if provided
    if (agents) {
      await tx.delete(scenarioAgent).where(eq(scenarioAgent.scenarioId, id));
      if (agents.length) {
        await tx.insert(scenarioAgent).values(
          agents.map((a, i) => ({
            scenarioId: id,
            personaId: a.personaId,
            openingMessage: a.openingMessage || null,
            sortOrder: a.sortOrder ?? i,
            maxResponseTokens: a.maxResponseTokens ?? null,
          })),
        );
      }
    }

    return [row];
  });

  clearAgentCache(id);
  auditLog(
    'scenario.update',
    currentUser.id,
    { scenarioId: id },
    c.get('requestId'),
  );
  return c.json({ scenario: updated });
});

adminScenarioByIdRoutes.delete('/:id', async (c) => {
  const parsed = parseUUID(c, 'id', 'scenario');
  if ('error' in parsed) return parsed.error;
  const { id } = parsed;

  const [target] = await db
    .select({ id: scenario.id, courseId: scenario.courseId })
    .from(scenario)
    .where(eq(scenario.id, id));

  if (!target) {
    return c.json({ error: 'Scenario not found' }, 404);
  }

  const deleted = await db.transaction(async (tx) => {
    // Check for referencing conversations before attempting delete
    const [{ refCount }] = await tx
      .select({ refCount: count() })
      .from(conversation)
      .where(eq(conversation.scenarioId, id));

    if (refCount > 0) return false;

    // scenarioAgent rows cascade-delete automatically via FK
    await tx.delete(scenario).where(eq(scenario.id, id));

    // IMPORTANT: course.scenarioCount is denormalized — see CREATE handler above.
    await tx
      .update(course)
      .set({
        scenarioCount: sql`max(${course.scenarioCount} - 1, 0)`,
      })
      .where(eq(course.id, target.courseId));

    return true;
  });

  if (!deleted) {
    return c.json(
      {
        error:
          'Cannot delete scenario while conversations reference it. Delete or reassign conversations first.',
      },
      409,
    );
  }

  clearAgentCache(id);
  auditLog(
    'scenario.delete',
    c.get('user').id,
    {
      scenarioId: id,
      courseId: target.courseId,
    },
    c.get('requestId'),
  );
  return c.json({ success: true });
});
