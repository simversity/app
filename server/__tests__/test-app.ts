/**
 * Creates a test Hono app that mounts real route handlers with mocked deps.
 * The preload module must be loaded before this file is imported.
 */
import { Hono } from 'hono';
import { isShuttingDown } from '../lib/shutdown';
import type { AppEnv } from '../lib/types';
import { adminRoutes } from '../routes/admin';
import { conversationRoutes } from '../routes/conversations';
import { courseRoutes } from '../routes/courses';
import { modelRoutes } from '../routes/models';
import { progressRoutes } from '../routes/progress';
import { userRoutes } from '../routes/user';
import { testSqlite } from './preload';

export function createTestApp() {
  const app = new Hono<AppEnv>();

  // Request ID middleware (same as server/index.ts)
  app.use('*', async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);
    await next();
  });

  // Mount routes at the same paths as the real server
  app.route('/api/courses', courseRoutes);
  app.route('/api/conversations', conversationRoutes);
  app.route('/api/progress', progressRoutes);
  app.route('/api/admin', adminRoutes);
  app.route('/api/models', modelRoutes);
  app.route('/api/user', userRoutes);

  // Health endpoint (uses the test in-memory sqlite)
  app.get('/api/health', (c) => {
    if (isShuttingDown()) {
      return c.json({ status: 'shutting_down' }, 503);
    }
    try {
      const result = testSqlite.query('SELECT 1 AS ok').get() as {
        ok: number;
      } | null;
      if (result?.ok !== 1) throw new Error('DB check failed');
      return c.json({ status: 'ok' });
    } catch {
      return c.json({ status: 'error', detail: 'Database unreachable' }, 503);
    }
  });

  // Global error handler
  app.onError((_err, c) => {
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
