import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db';
import { dailyBudget } from '../db/schema';
import { DAILY_MESSAGE_LIMIT } from '../lib/env';
import type { AppEnv } from '../lib/types';

export const budgetRoutes = new Hono<AppEnv>();

budgetRoutes.get('/', async (c) => {
  const user = c.get('user');

  if (DAILY_MESSAGE_LIMIT <= 0) {
    return c.json({ used: 0, limit: 0, remaining: 0, enabled: false });
  }

  const today = new Date().toISOString().slice(0, 10);
  const row = db
    .select({ count: dailyBudget.count })
    .from(dailyBudget)
    .where(and(eq(dailyBudget.userId, user.id), eq(dailyBudget.date, today)))
    .get();

  const used = row?.count ?? 0;
  const remaining = Math.max(0, DAILY_MESSAGE_LIMIT - used);

  return c.json({
    used,
    limit: DAILY_MESSAGE_LIMIT,
    remaining,
    enabled: true,
  });
});
