import { count, countDistinct, eq, sum } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db';
import { conversation, course, progress } from '../db/schema';
import { parsePagination } from '../lib/pagination';
import type { AppEnv } from '../lib/types';
import { requireVerified } from '../middleware/auth';

export const progressRoutes = new Hono<AppEnv>();

progressRoutes.use('*', requireVerified);

// GET /api/progress — Get user's progress overview
progressRoutes.get('/', async (c) => {
  const user = c.get('user');
  const { limit, offset } = parsePagination(c);

  const [records, [{ total }]] = await Promise.all([
    db.query.progress.findMany({
      where: eq(progress.userId, user.id),
      with: {
        course: true,
        scenario: {
          columns: {
            id: true,
            title: true,
            description: true,
            courseId: true,
            sortOrder: true,
          },
        },
      },
      limit,
      offset,
    }),
    db
      .select({ total: count() })
      .from(progress)
      .where(eq(progress.userId, user.id)),
  ]);

  return c.json({ progress: records, total });
});

// GET /api/progress/summary — Dashboard summary stats
progressRoutes.get('/summary', async (c) => {
  const user = c.get('user');

  // Aggregate stats in a single query
  const [stats] = await db
    .select({
      totalConversations: count(),
      totalScenariosPracticed: countDistinct(conversation.scenarioId),
      totalMessages: sum(conversation.messageCount),
    })
    .from(conversation)
    .where(eq(conversation.userId, user.id));

  // Count total published courses
  const [courseCount] = await db
    .select({ total: count() })
    .from(course)
    .where(eq(course.visibility, 'published'));

  // Get recent conversations with scenario and agent info
  const recentConversations = await db.query.conversation.findMany({
    where: eq(conversation.userId, user.id),
    with: {
      scenario: {
        columns: {
          id: true,
          title: true,
          courseId: true,
        },
        with: {
          agents: {
            with: { persona: { columns: { name: true } } },
            orderBy: (a, { asc }) => [asc(a.sortOrder)],
          },
        },
      },
    },
    orderBy: (c, { desc }) => [desc(c.startedAt)],
    limit: 5,
  });

  return c.json({
    totalConversations: stats.totalConversations,
    totalScenariosPracticed: stats.totalScenariosPracticed,
    totalCourses: courseCount.total,
    totalMessages: Number(stats.totalMessages) || 0,
    recentConversations: recentConversations.map((c) => {
      const agentNames = c.scenario.agents
        .map((a) => a.persona.name)
        .filter(Boolean);
      const studentLabel =
        agentNames.length > 0 ? agentNames.join(', ') : 'Student';
      return {
        id: c.id,
        scenarioId: c.scenario.id,
        scenarioTitle: c.scenario.title,
        studentName: studentLabel,
        courseId: c.scenario.courseId,
        messageCount: c.messageCount,
        status: c.status,
        startedAt: c.startedAt,
      };
    }),
  });
});
