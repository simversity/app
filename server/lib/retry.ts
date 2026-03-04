import { log } from './logger';

/**
 * Retry a function with exponential backoff for transient failures.
 * Only retries on 5xx-like errors and timeouts, not on 4xx or content policy errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const { maxRetries = 2, baseDelayMs = 500 } = opts;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !isRetryable(err)) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs;
      log.warn(
        {
          attempt: attempt + 1,
          maxRetries,
          delayMs: delay,
          error: (err as Error).message,
        },
        'Retrying after transient failure',
      );
      await sleep(delay);
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // Timeout errors are retryable
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;

  // OpenAI SDK errors expose a `status` property
  const status = (err as { status?: number }).status;
  if (typeof status === 'number') {
    // Retry on 5xx (server error) and 429 (rate limit)
    if (status >= 500 || status === 429) return true;
    // Don't retry on 4xx (client error, content policy, auth)
    if (status >= 400 && status < 500) return false;
  }

  // Connection errors are retryable
  const code = (err as { code?: string }).code;
  if (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'UND_ERR_CONNECT_TIMEOUT'
  ) {
    return true;
  }
  if (err.message.includes('fetch failed')) {
    return true;
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
