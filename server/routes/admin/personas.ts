import { count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../db';
import { persona, scenarioAgent } from '../../db/schema';
import { auditLog } from '../../lib/audit';
import { clearAgentCache } from '../../lib/conversation-helpers';
import { parsePagination } from '../../lib/pagination';
import type { AppEnv } from '../../lib/types';
import { buildUpdateSet } from '../../lib/utils';
import { hasUpdateFields, parseBody, parseUUID } from '../../lib/validation';

const createPersonaSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  systemPrompt: z.string().min(1).max(50000),
});

const updatePersonaSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  systemPrompt: z.string().min(1).max(50000).optional(),
});

export const adminPersonaRoutes = new Hono<AppEnv>();

adminPersonaRoutes.get('/', async (c) => {
  const { limit, offset } = parsePagination(c);

  const [personas, [{ total }]] = await Promise.all([
    db.query.persona.findMany({
      orderBy: (p, { desc }) => [desc(p.createdAt)],
      limit,
      offset,
    }),
    db.select({ total: count() }).from(persona),
  ]);
  return c.json({ personas, total });
});

adminPersonaRoutes.get('/:id', async (c) => {
  const parsed = parseUUID(c, 'id', 'persona');
  if ('error' in parsed) return parsed.error;
  const { id } = parsed;

  const result = await db.query.persona.findFirst({
    where: eq(persona.id, id),
  });

  if (!result) {
    return c.json({ error: 'Persona not found' }, 404);
  }

  return c.json({ persona: result });
});

adminPersonaRoutes.post('/', async (c) => {
  const result = await parseBody(c, createPersonaSchema);
  if ('error' in result) return result.error;
  const { name, description, systemPrompt } = result.data;

  const currentUser = c.get('user');

  const [created] = await db
    .insert(persona)
    .values({
      name,
      description,
      systemPrompt,
      createdBy: currentUser.id,
    })
    .returning();

  auditLog(
    'persona.create',
    currentUser.id,
    { personaId: created.id },
    c.get('requestId'),
  );
  return c.json({ persona: created }, 201);
});

adminPersonaRoutes.patch('/:id', async (c) => {
  const parsed = parseUUID(c, 'id', 'persona');
  if ('error' in parsed) return parsed.error;
  const { id } = parsed;
  const result = await parseBody(c, updatePersonaSchema);
  if ('error' in result) return result.error;
  const { name, description, systemPrompt } = result.data;

  if (!hasUpdateFields(result.data)) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  const [target] = await db
    .select({ id: persona.id })
    .from(persona)
    .where(eq(persona.id, id));

  if (!target) {
    return c.json({ error: 'Persona not found' }, 404);
  }

  const personaUpdates = buildUpdateSet({ name, description, systemPrompt });

  const [updated] = await db
    .update(persona)
    .set(personaUpdates)
    .where(eq(persona.id, id))
    .returning();

  clearAgentCache(); // persona changes affect all scenarios using this persona
  auditLog(
    'persona.update',
    c.get('user').id,
    { personaId: id },
    c.get('requestId'),
  );
  return c.json({ persona: updated });
});

adminPersonaRoutes.delete('/:id', async (c) => {
  const parsed = parseUUID(c, 'id', 'persona');
  if ('error' in parsed) return parsed.error;
  const { id } = parsed;

  const result = await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: persona.id })
      .from(persona)
      .where(eq(persona.id, id));

    if (!target) return { error: 'Persona not found', status: 404 as const };

    const usages = await tx
      .select({ id: scenarioAgent.id })
      .from(scenarioAgent)
      .where(eq(scenarioAgent.personaId, id));

    if (usages.length > 0) {
      return {
        error: `Persona is used in ${usages.length} scenario(s). Remove it from scenarios first.`,
        status: 400 as const,
      };
    }

    await tx.delete(persona).where(eq(persona.id, id));
    return { success: true };
  });

  if ('error' in result) {
    return c.json({ error: result.error }, result.status);
  }
  auditLog(
    'persona.delete',
    c.get('user').id,
    { personaId: id },
    c.get('requestId'),
  );
  return c.json({ success: true });
});
