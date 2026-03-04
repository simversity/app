import { describe, expect, test } from 'bun:test';
import { withRetry } from '../retry';

/** Create an error with a numeric status property (like OpenAI SDK errors) */
function apiError(status: number, message: string): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

/** Create an error with a code property (like Node.js system errors) */
function sysError(code: string): Error {
  const err = new Error(code);
  (err as Error & { code: string }).code = code;
  return err;
}

describe('withRetry', () => {
  test('returns result on first success', async () => {
    const result = await withRetry(async () => 'ok');
    expect(result).toBe('ok');
  });

  test('retries on retryable error and succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw apiError(500, 'Internal Server Error');
        return 'ok';
      },
      { maxRetries: 3, baseDelayMs: 10 },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  test('does not retry on 4xx errors', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw apiError(401, 'Unauthorized');
        },
        { maxRetries: 3, baseDelayMs: 10 },
      ),
    ).rejects.toThrow('Unauthorized');
    expect(attempts).toBe(1);
  });

  test('throws after max retries exhausted', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw apiError(500, 'Server Error');
        },
        { maxRetries: 2, baseDelayMs: 10 },
      ),
    ).rejects.toThrow('Server Error');
    expect(attempts).toBe(3); // initial + 2 retries
  });

  test('retries on connection errors', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts === 1) throw sysError('ECONNRESET');
        return 'ok';
      },
      { maxRetries: 2, baseDelayMs: 10 },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  test('retries on 429 rate limit errors', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts === 1) throw apiError(429, 'Too Many Requests');
        return 'ok';
      },
      { maxRetries: 2, baseDelayMs: 10 },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  test('retries on fetch failed errors', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts === 1) throw new Error('fetch failed');
        return 'ok';
      },
      { maxRetries: 2, baseDelayMs: 10 },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  test('does not retry non-Error thrown values', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw 'string error';
        },
        { maxRetries: 3, baseDelayMs: 10 },
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });
});
