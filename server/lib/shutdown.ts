import { clearDbTimers } from '../db';
import { SHUTDOWN_GRACE_MS } from './env';
import { log } from './logger';
import { clearRateLimitTimers } from './rate-limit';

// --- Stream tracking (merged from stream-tracker.ts) ---

const activeStreams = new Set<AbortController>();
const userStreamCounts = new Map<string, number>();
let shuttingDown = false;

export const MAX_ACTIVE_STREAMS = 500;
export const MAX_USER_STREAMS = 5;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

/** Exported for testing only. */
export function setShuttingDown(): void {
  shuttingDown = true;
}

export function canAcceptStream(userId?: string): boolean {
  if (shuttingDown || activeStreams.size >= MAX_ACTIVE_STREAMS) return false;
  if (userId && (userStreamCounts.get(userId) ?? 0) >= MAX_USER_STREAMS)
    return false;
  return true;
}

export function trackStream(userId?: string): AbortController {
  const ac = new AbortController();
  activeStreams.add(ac);
  if (userId) {
    userStreamCounts.set(userId, (userStreamCounts.get(userId) ?? 0) + 1);
  }
  return ac;
}

export function untrackStream(ac: AbortController, userId?: string): void {
  activeStreams.delete(ac);
  if (userId) {
    const count = (userStreamCounts.get(userId) ?? 0) - 1;
    if (count <= 0) userStreamCounts.delete(userId);
    else userStreamCounts.set(userId, count);
  }
}

export function getActiveStreamCount(): number {
  return activeStreams.size;
}

/** Reset all stream tracking state — for use in tests only. */
export function resetStreamTracker(): void {
  activeStreams.clear();
  userStreamCounts.clear();
  shuttingDown = false;
}

// --- Graceful shutdown ---

export function initGracefulShutdown(
  server: { stop(): void },
  sqliteDb: { close(): void; exec(sql: string): void },
): void {
  const shutdown = async () => {
    if (isShuttingDown()) return;
    setShuttingDown();
    log.info(
      { activeStreams: getActiveStreamCount() },
      'Shutting down gracefully',
    );
    server.stop();

    // Clear periodic timers so they don't fire during shutdown
    clearDbTimers();
    clearRateLimitTimers();

    const deadline = Date.now() + SHUTDOWN_GRACE_MS;
    while (getActiveStreamCount() > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }

    // Abort remaining streams — wrap each in try-catch so one failure
    // doesn't prevent the rest from being aborted
    for (const ac of [...activeStreams]) {
      try {
        ac.abort();
      } catch (err) {
        log.error(
          { error: err instanceof Error ? err.message : err },
          'Error aborting stream during shutdown',
        );
      }
    }

    // Flush WAL to main database file before closing
    try {
      sqliteDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      log.info('WAL checkpoint completed');
    } catch (err) {
      log.error(
        { error: err instanceof Error ? err.message : err },
        'WAL checkpoint failed',
      );
    }

    sqliteDb.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
