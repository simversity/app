import { count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../../db';
import { accessCode } from '../../db/schema';
import { auditLog } from '../../lib/audit';
import { parsePagination } from '../../lib/pagination';
import type { AppEnv } from '../../lib/types';
import { parseBody, parseUUID } from '../../lib/validation';

const createAccessCodeSchema = z.object({
  role: z.enum(['teacher', 'admin']).default('teacher'),
  expiresAt: z
    .string()
    .datetime({ message: 'expiresAt must be an ISO 8601 datetime string' })
    .optional(),
});

export const adminAccessCodeRoutes = new Hono<AppEnv>();

adminAccessCodeRoutes.get('/', async (c) => {
  const { limit, offset } = parsePagination(c);

  const [codes, [{ total }]] = await Promise.all([
    db
      .select()
      .from(accessCode)
      .orderBy(accessCode.createdAt)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(accessCode),
  ]);

  const masked = codes.map((c) => ({
    ...c,
    code: `****${c.code.slice(-4)}`,
  }));

  return c.json({ codes: masked, total });
});

adminAccessCodeRoutes.post('/', async (c) => {
  const result = await parseBody(c, createAccessCodeSchema);
  if ('error' in result) return result.error;
  const { role, expiresAt: expiresAtStr } = result.data;

  const currentUser = c.get('user');
  const code = nanoid(12);

  let expiresAt: Date | null = null;
  if (expiresAtStr) {
    expiresAt = new Date(expiresAtStr);
    if (expiresAt < new Date()) {
      return c.json({ error: 'expiresAt must be in the future' }, 400);
    }
  }

  const [created] = await db
    .insert(accessCode)
    .values({
      code,
      role,
      createdBy: currentUser.id,
      expiresAt,
    })
    .returning();

  auditLog(
    'access_code.create',
    currentUser.id,
    { codeId: created.id, role },
    c.get('requestId'),
  );
  return c.json({ code: created }, 201);
});

adminAccessCodeRoutes.delete('/:id', async (c) => {
  const parsed = parseUUID(c, 'id', 'access code');
  if ('error' in parsed) return parsed.error;
  const { id } = parsed;

  const result = await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: accessCode.id, usedBy: accessCode.usedBy })
      .from(accessCode)
      .where(eq(accessCode.id, id));

    if (!target)
      return { error: 'Access code not found', status: 404 as const };
    if (target.usedBy)
      return {
        error: 'Cannot delete an already-used code',
        status: 409 as const,
      };

    await tx.delete(accessCode).where(eq(accessCode.id, id));
    return { success: true };
  });

  if ('error' in result) {
    return c.json({ error: result.error }, result.status);
  }

  auditLog(
    'access_code.delete',
    c.get('user').id,
    { codeId: id },
    c.get('requestId'),
  );
  return c.json({ success: true });
});
