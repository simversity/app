import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { env } from '../lib/env';
import { log } from '../lib/logger';
import * as schema from './schema';

export const sqlite = new Database(env.DATABASE_URL);
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec('PRAGMA busy_timeout = 5000');
sqlite.exec('PRAGMA synchronous = NORMAL');
sqlite.exec('PRAGMA cache_size = -64000');
sqlite.exec('PRAGMA temp_store = MEMORY');
export const db = drizzle({ client: sqlite, schema });

function cleanExpiredSessions() {
  try {
    sqlite.exec("DELETE FROM session WHERE expiresAt < unixepoch('now')");
  } catch (err) {
    log.error(
      { error: err instanceof Error ? err.message : err },
      'Session cleanup failed',
    );
  }
}
setTimeout(cleanExpiredSessions, 5_000);
const sessionCleanupTimer = setInterval(cleanExpiredSessions, 60 * 60 * 1000);
sessionCleanupTimer.unref();

function cleanExpiredVerifications() {
  try {
    sqlite.exec("DELETE FROM verification WHERE expiresAt < unixepoch('now')");
  } catch (err) {
    log.error(
      { error: err instanceof Error ? err.message : err },
      'Verification cleanup failed',
    );
  }
}
const verificationTimer = setInterval(
  cleanExpiredVerifications,
  60 * 60 * 1000,
);
verificationTimer.unref();

function cleanExpiredAccessCodes() {
  try {
    sqlite.exec(
      "DELETE FROM accessCode WHERE expiresAt IS NOT NULL AND expiresAt < unixepoch('now') AND usedBy IS NULL",
    );
  } catch (err) {
    log.error(
      { error: err instanceof Error ? err.message : err },
      'Access code cleanup failed',
    );
  }
}
const accessCodeTimer = setInterval(cleanExpiredAccessCodes, 60 * 60 * 1000);
accessCodeTimer.unref();

// Periodic WAL checkpoints to keep WAL file size manageable
const walCheckpointTimer = setInterval(
  () => {
    try {
      sqlite.exec('PRAGMA wal_checkpoint(PASSIVE)');
    } catch (err) {
      log.error(
        { error: err instanceof Error ? err.message : err },
        'WAL checkpoint failed',
      );
    }
  },
  5 * 60 * 1000,
);
walCheckpointTimer.unref();

/** Clear all periodic cleanup timers (called during graceful shutdown). */
export function clearDbTimers(): void {
  clearInterval(sessionCleanupTimer);
  clearInterval(verificationTimer);
  clearInterval(accessCodeTimer);
  clearInterval(walCheckpointTimer);
}
