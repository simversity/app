import { db } from '../db';
import { createDailyBudget } from './daily-budget';
import { DAILY_MESSAGE_LIMIT } from './env';

/**
 * Single shared daily-budget checker used by both conversation and observer
 * routes, so AI messages of all types count against the same per-user limit.
 * Persisted to SQLite via Drizzle so counts survive server restarts.
 */
export const checkDailyBudget =
  DAILY_MESSAGE_LIMIT > 0 ? createDailyBudget(DAILY_MESSAGE_LIMIT, db) : null;
