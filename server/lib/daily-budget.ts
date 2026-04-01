import { and, eq, lt, sql } from 'drizzle-orm';
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

  // In-memory helpers used only by the unit-test path (no database).
  // The DB path is handled directly inside check() and release().
  function memGetCount(userId: string, today: string): number {
    const entry = memStore?.get(userId);
    return entry?.date === today ? entry.count : 0;
  }

  function memSetCount(userId: string, date: string, count: number): void {
    memStore?.set(userId, { count, date });
  }

  function check(userId: string): boolean {
    const today = new Date().toISOString().slice(0, 10);

    if (database) {
      // Wrap read + write in a transaction so the count cannot change between
      // the SELECT and the INSERT. Safe under SQLite's serialized-write model
      // today; the transaction also makes this correct if we migrate to
      // Postgres (add SELECT … FOR UPDATE there).
      try {
        return database.transaction((tx) => {
          const row = tx
            .select({ count: dailyBudget.count })
            .from(dailyBudget)
            .where(
              and(eq(dailyBudget.userId, userId), eq(dailyBudget.date, today)),
            )
            .get();
          const current = row?.count ?? 0;
          if (current >= maxPerDay) return false;

          tx.insert(dailyBudget)
            .values({ userId, date: today, count: current + 1 })
            .onConflictDoUpdate({
              target: [dailyBudget.userId, dailyBudget.date],
              set: { count: current + 1 },
            })
            .run();
          return true;
        });
      } catch (err) {
        log.error(
          { userId, error: err instanceof Error ? err.message : err },
          'Daily budget check failed — failing open (user not blocked)',
        );
        return true; // fail-open to avoid blocking users on DB errors
      }
    }

    // In-memory fallback (unit tests)
    const count = memGetCount(userId, today);
    if (count >= maxPerDay) return false;
    memSetCount(userId, today, count + 1);
    return true;
  }

  /** Release a budget slot (call when a counted request fails). */
  function release(userId: string): void {
    const today = new Date().toISOString().slice(0, 10);

    if (database) {
      try {
        database
          .update(dailyBudget)
          .set({ count: sql`MAX(${dailyBudget.count} - 1, 0)` })
          .where(
            and(eq(dailyBudget.userId, userId), eq(dailyBudget.date, today)),
          )
          .run();
      } catch (err) {
        log.warn(
          { userId, error: err instanceof Error ? err.message : err },
          'Daily budget release failed',
        );
      }
      return;
    }

    // In-memory fallback (unit tests)
    const count = memGetCount(userId, today);
    if (count > 0) {
      memSetCount(userId, today, count - 1);
    }
  }

  return Object.assign(check, { release });
}
