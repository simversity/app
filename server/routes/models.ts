import { Hono } from 'hono';
import { fetchModels } from '../ai/models';
import { log } from '../lib/logger';
import type { AppEnv } from '../lib/types';
import { requireVerified } from '../middleware/auth';

export const modelRoutes = new Hono<AppEnv>();

modelRoutes.use('*', requireVerified);

modelRoutes.get('/', async (c) => {
  try {
    const models = await fetchModels();
    return c.json({ models });
  } catch (err) {
    log.error(
      { error: err instanceof Error ? err.message : err },
      'Failed to fetch models from AI provider',
    );
    return c.json({ error: 'AI provider unavailable' }, 502);
  }
});
