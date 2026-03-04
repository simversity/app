import type { Context } from 'hono';

export function parsePagination(c: Context): { limit: number; offset: number } {
  const limit = Math.max(Math.min(Number(c.req.query('limit')) || 50, 200), 1);
  const offset = Math.max(
    Math.min(Number(c.req.query('offset')) || 0, 100_000),
    0,
  );
  return { limit, offset };
}
