import { count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../db';
import { course } from '../../db/schema';
import { auditLog } from '../../lib/audit';
import { parsePagination } from '../../lib/pagination';
import type { AppEnv } from '../../lib/types';
import { buildUpdateSet } from '../../lib/utils';
import { hasUpdateFields, parseBody, parseUUID } from '../../lib/validation';

const createCourseSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  gradeLevel: z.string().min(1).max(100),
  subject: z.string().min(1).max(100),
  visibility: z
    .enum(['private', 'shared', 'published', 'archived'])
    .default('private'),
});

const updateCourseSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().min(1).max(5000).optional(),
  gradeLevel: z.string().min(1).max(100).optional(),
  subject: z.string().min(1).max(100).optional(),
  visibility: z.enum(['private', 'shared', 'published', 'archived']).optional(),
});

export const adminCourseRoutes = new Hono<AppEnv>();

adminCourseRoutes.get('/', async (c) => {
  const { limit, offset } = parsePagination(c);

  const [courses, [{ total }]] = await Promise.all([
    db.query.course.findMany({
      orderBy: (c, { desc }) => [desc(c.createdAt)],
      limit,
      offset,
    }),
    db.select({ total: count() }).from(course),
  ]);
  return c.json({ courses, total });
});

adminCourseRoutes.get('/:id', async (c) => {
  const parsed = parseUUID(c, 'id', 'course');
  if ('error' in parsed) return parsed.error;
  const { id } = parsed;
  const [found] = await db.select().from(course).where(eq(course.id, id));

  if (!found) {
    return c.json({ error: 'Course not found' }, 404);
  }

  return c.json({ course: found });
});

adminCourseRoutes.post('/', async (c) => {
  const result = await parseBody(c, createCourseSchema);
  if ('error' in result) return result.error;
  const { title, description, gradeLevel, subject, visibility } = result.data;

  const currentUser = c.get('user');
  const id = crypto.randomUUID();

  const [created] = await db
    .insert(course)
    .values({
      id,
      title,
      description,
      gradeLevel,
      subject,
      visibility,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    })
    .returning();

  auditLog(
    'course.create',
    currentUser.id,
    { courseId: id },
    c.get('requestId'),
  );
  return c.json({ course: created }, 201);
});

adminCourseRoutes.patch('/:id', async (c) => {
  const parsed = parseUUID(c, 'id', 'course');
  if ('error' in parsed) return parsed.error;
  const { id } = parsed;
  const result = await parseBody(c, updateCourseSchema);
  if ('error' in result) return result.error;
  const { title, description, gradeLevel, subject, visibility } = result.data;

  if (!hasUpdateFields(result.data)) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  const currentUser = c.get('user');

  const updates = buildUpdateSet(
    { title, description, gradeLevel, subject, visibility },
    currentUser.id,
  );

  const [updated] = await db
    .update(course)
    .set(updates)
    .where(eq(course.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: 'Course not found' }, 404);
  }

  auditLog(
    'course.update',
    currentUser.id,
    { courseId: id },
    c.get('requestId'),
  );
  return c.json({ course: updated });
});

adminCourseRoutes.delete('/:id', async (c) => {
  const parsed = parseUUID(c, 'id', 'course');
  if ('error' in parsed) return parsed.error;
  const { id } = parsed;
  const currentUser = c.get('user');

  const [updated] = await db
    .update(course)
    .set({
      visibility: 'archived',
      updatedBy: currentUser.id,
      updatedAt: new Date(),
    })
    .where(eq(course.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: 'Course not found' }, 404);
  }

  auditLog(
    'course.archive',
    currentUser.id,
    { courseId: id },
    c.get('requestId'),
  );
  return c.json({ success: true });
});
