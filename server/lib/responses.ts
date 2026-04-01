import type { Context } from 'hono';

/** Standard 429 response for rate-limited requests. */
export const tooManyRequests = (c: Context) =>
  c.json(
    { error: 'Too many requests. Please wait a moment and try again.' },
    429,
  );

/** Standard 429 response when the daily message budget is exhausted. */
export const dailyLimitReached = (c: Context) =>
  c.json(
    { error: 'Daily message limit reached. Please try again tomorrow.' },
    429,
  );
