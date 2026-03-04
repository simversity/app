import { and, eq, lt } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { dailyBudget } from '../db/schema';
import { log } from './logger';

type DrizzleDb = BunSQLiteDatabase<Record<string, unknown>>;

/**
 * Daily message budget tracker. When a Drizzle db instance is provided,
 * counts are read/written via Drizzle queries.
 * When no database is provided (unit tests), uses a plain Map.
 */
export function createDailyBudget(maxPerDay: number, database?: DrizzleDb) {
  // In-memory fallback for unit tests (no DB)
  const memStore = !database
    ? new Map<string, { count: number; date: string }>()
    : null;

  // Periodic cleanup of old DB rows
  if (database) {
    const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
    const timer = setInterval(() => {
      const today = new Date().toISOString().slice(0, 10);
      try {
        database.delete(dailyBudget).where(lt(dailyBudget.date, today)).run();
      } catch (err) {
        log.warn(
          { error: err instanceof Error ? err.message : err },
          'Daily budget cleanup failed',
        );
      }
    }, CLEANUP_INTERVAL_MS);
    timer.unref();
  }

  function getCount(userId: string, today: string): number {
    if (database) {
      try {
        const row = database
          .select({ count: dailyBudget.count })
          .from(dailyBudget)
          .where(
            and(eq(dailyBudget.userId, userId), eq(dailyBudget.date, today)),
          )
          .get();
        return row?.count ?? 0;
      } catch (err) {
        log.warn(
          { userId, error: err instanceof Error ? err.message : err },
          'Daily budget DB read failed',
        );
        return 0;
      }
    }
    const entry = memStore?.get(userId);
    return entry?.date === today ? entry.count : 0;
  }

  function setCount(userId: string, date: string, count: number): void {
    if (database) {
      try {
        database
          .insert(dailyBudget)
          .values({ userId, date, count })
          .onConflictDoUpdate({
            target: [dailyBudget.userId, dailyBudget.date],
            set: { count },
          })
          .run();
      } catch (err) {
        log.warn(
          { userId, error: err instanceof Error ? err.message : err },
          'Daily budget DB write failed',
        );
      }
      return;
    }
    memStore?.set(userId, { count, date });
  }

  function check(userId: string): boolean {
    const today = new Date().toISOString().slice(0, 10);
    const count = getCount(userId, today);
    if (count >= maxPerDay) return false;
    setCount(userId, today, count + 1);
    return true;
  }

  /** Release a budget slot (call when a counted request fails). */
  function release(userId: string): void {
    const today = new Date().toISOString().slice(0, 10);
    const count = getCount(userId, today);
    if (count > 0) {
      setCount(userId, today, count - 1);
    }
  }

  return Object.assign(check, { release });
}
