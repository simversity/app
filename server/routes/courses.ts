import { and, asc, count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db';
import { course } from '../db/schema';
import { parsePagination } from '../lib/pagination';
import type { AppEnv } from '../lib/types';
import { parseUUID } from '../lib/validation';
import { requireVerified } from '../middleware/auth';

export const courseRoutes = new Hono<AppEnv>();

courseRoutes.use('*', requireVerified);

courseRoutes.get('/', async (c) => {
  const { limit, offset } = parsePagination(c);

  const [courses, [{ total }]] = await Promise.all([
    db
      .select({
        id: course.id,
        title: course.title,
        description: course.description,
        gradeLevel: course.gradeLevel,
        subject: course.subject,
        scenarioCount: course.scenarioCount,
        visibility: course.visibility,
      })
      .from(course)
      .where(eq(course.visibility, 'published'))
      .orderBy(asc(course.title))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(course)
      .where(eq(course.visibility, 'published')),
  ]);
  return c.json({ courses, total });
});

courseRoutes.get('/:id', async (c) => {
  const parsed = parseUUID(c, 'id', 'course');
  if ('error' in parsed) return parsed.error;
  const courseId = parsed.id;

  const result = await db.query.course.findFirst({
    where: and(eq(course.id, courseId), eq(course.visibility, 'published')),
    with: {
      scenarios: {
        orderBy: (s, { asc }) => [asc(s.sortOrder)],
        columns: {
          observerPrompt: false,
          activityContext: false,
        },
        with: {
          agents: {
            orderBy: (a, { asc }) => [asc(a.sortOrder)],
            with: { persona: { columns: { name: true } } },
          },
        },
      },
    },
  });

  if (!result) {
    return c.json({ error: 'Course not found' }, 404);
  }

  // Derive studentName and openingMessage from agents for each scenario
  const scenarios = result.scenarios.map((s) => {
    const { agents, ...rest } = s;
    return {
      ...rest,
      studentName: agents.map((a) => a.persona.name).join(', ') || 'Student',
      openingMessage: agents[0]?.openingMessage || null,
    };
  });

  return c.json({ ...result, scenarios });
});
