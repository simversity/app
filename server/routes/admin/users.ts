import { count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../db';
import { user } from '../../db/schema';
import { auditLog } from '../../lib/audit';
import { UserRole } from '../../lib/constants';
import { parsePagination } from '../../lib/pagination';
import type { AppEnv } from '../../lib/types';
import { isValidId, parseBody } from '../../lib/validation';

const updateRoleSchema = z.object({
  role: z.enum([UserRole.TEACHER, UserRole.ADMIN]),
});

export const adminUserRoutes = new Hono<AppEnv>();

adminUserRoutes.get('/', async (c) => {
  const { limit, offset } = parsePagination(c);

  const [users, [{ total }]] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(user.createdAt)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(user),
  ]);

  return c.json({ users, total });
});

adminUserRoutes.patch('/:id/role', async (c) => {
  const { id } = c.req.param();
  if (!isValidId(id)) return c.json({ error: 'Invalid user ID' }, 400);
  const result = await parseBody(c, updateRoleSchema);
  if ('error' in result) return result.error;
  const { role } = result.data;

  const currentUser = c.get('user');
  if (id === currentUser.id) {
    return c.json({ error: 'Cannot change your own role' }, 400);
  }

  const [target] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.id, id));

  if (!target) {
    return c.json({ error: 'User not found' }, 404);
  }

  if (target.role === UserRole.SUPER_ADMIN) {
    return c.json({ error: 'Cannot modify super_admin role' }, 403);
  }

  const [updated] = await db
    .update(user)
    .set({ role })
    .where(eq(user.id, id))
    .returning({ id: user.id });

  if (!updated) {
    return c.json({ error: 'User not found' }, 404);
  }

  auditLog(
    'user.role_change',
    currentUser.id,
    {
      targetUserId: id,
      previousRole: target.role,
      newRole: role,
    },
    c.get('requestId'),
  );
  return c.json({ success: true, id, role });
});
