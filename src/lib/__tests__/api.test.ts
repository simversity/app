import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ApiError, apiFetch, apiMutate } from '../api';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response()),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('apiFetch', () => {
  test('returns parsed JSON on success', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 1 }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch;

    const result = await apiFetch<{ id: number }>('/api/test');
    expect(result).toEqual({ id: 1 });
  });

  test('includes credentials in request', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch;

    await apiFetch('/api/test');

    const calls = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock
      .calls;
    expect(calls[0][1]).toMatchObject({ credentials: 'include' });
  });

  test('throws ApiError with status on non-ok response', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch;

    try {
      await apiFetch('/api/missing');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
      expect((err as ApiError).message).toBe('Not found');
    }
  });

  test('falls back to generic message when error body is not JSON', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Server Error', { status: 500 })),
    ) as unknown as typeof fetch;

    try {
      await apiFetch('/api/broken');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(500);
      expect((err as ApiError).message).toBe('Request failed: 500');
    }
  });

  test('returns undefined on 204 No Content', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('', { status: 204 })),
    ) as unknown as typeof fetch;

    const result = await apiFetch('/api/no-content');
    expect(result).toBeUndefined();
  });

  test('returns undefined on non-JSON content-type', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response('OK', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    ) as unknown as typeof fetch;

    const result = await apiFetch('/api/text');
    expect(result).toBeUndefined();
  });
});

describe('apiMutate', () => {
  test('sends POST with JSON body by default', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch;

    await apiMutate('/api/create', { body: { name: 'test' } });

    const calls = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock
      .calls;
    expect(calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(calls[0][1].body).toBe(JSON.stringify({ name: 'test' }));
  });

  test('supports custom method', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch;

    await apiMutate('/api/update', { method: 'PATCH', body: { x: 1 } });

    const calls = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock
      .calls;
    expect(calls[0][1].method).toBe('PATCH');
  });

  test('returns undefined for 204 responses', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('', { status: 204 })),
    ) as unknown as typeof fetch;

    const result = await apiMutate('/api/delete', { method: 'DELETE' });
    expect(result).toBeUndefined();
  });

  test('omits content-type header when no body', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch;

    await apiMutate('/api/delete', { method: 'DELETE' });

    const calls = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock
      .calls;
    expect(calls[0][1].headers).toBeUndefined();
    expect(calls[0][1].body).toBeUndefined();
  });
});

describe('ApiError', () => {
  test('has correct name and properties', () => {
    const err = new ApiError('test error', 422);
    expect(err.name).toBe('ApiError');
    expect(err.message).toBe('test error');
    expect(err.status).toBe(422);
    expect(err).toBeInstanceOf(Error);
  });
});
