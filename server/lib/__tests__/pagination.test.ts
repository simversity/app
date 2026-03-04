import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { parsePagination } from '../pagination';

describe('parsePagination', () => {
  const app = new Hono();
  app.get('/test', (c) => {
    return c.json(parsePagination(c));
  });

  async function getPagination(query: string) {
    const req = new Request(`http://localhost/test${query}`);
    const res = await app.fetch(req);
    return (await res.json()) as { limit: number; offset: number };
  }

  test('returns defaults when no query params', async () => {
    const { limit, offset } = await getPagination('');
    expect(limit).toBe(50);
    expect(offset).toBe(0);
  });

  test('respects valid limit and offset', async () => {
    const { limit, offset } = await getPagination('?limit=10&offset=20');
    expect(limit).toBe(10);
    expect(offset).toBe(20);
  });

  test('clamps limit to max 200', async () => {
    const { limit } = await getPagination('?limit=999');
    expect(limit).toBe(200);
  });

  test('treats limit=0 as default (falsy falls through to 50)', async () => {
    const { limit } = await getPagination('?limit=0');
    expect(limit).toBe(50);
  });

  test('clamps negative limit to 1', async () => {
    const { limit } = await getPagination('?limit=-5');
    expect(limit).toBe(1);
  });

  test('clamps offset to min 0', async () => {
    const { offset } = await getPagination('?offset=-10');
    expect(offset).toBe(0);
  });

  test('clamps offset to max 100000', async () => {
    const { offset } = await getPagination('?offset=999999');
    expect(offset).toBe(100_000);
  });

  test('handles non-numeric values gracefully', async () => {
    const { limit, offset } = await getPagination('?limit=abc&offset=xyz');
    expect(limit).toBe(50);
    expect(offset).toBe(0);
  });
});
