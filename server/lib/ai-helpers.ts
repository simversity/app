import type { SSEStreamingApi } from 'hono/streaming';
import type { OpenAI } from 'openai';
import { log } from './logger';
import { withRetry } from './retry';

type CreateStreamFn = () => Promise<
  AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
>;

/** Classify an AI error into a category for user-facing messages. */
function classifyError(err: unknown): 'timeout' | 'rate_limited' | 'generic' {
  if (!(err instanceof Error)) return 'generic';
  const msg = err.message.toLowerCase();
  if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
  if (msg.includes('429') || msg.includes('rate limit')) return 'rate_limited';
  return 'generic';
}

/**
 * Call an AI streaming endpoint with retry logic, logging,
 * and SSE error writing. Returns the stream on success or writes an error
 * SSE event and returns null.
 */
export async function callAIWithRetry(
  createStream: CreateStreamFn,
  opts: {
    stream: SSEStreamingApi;
    errorMessage: string;
    timeoutMessage?: string;
    rateLimitMessage?: string;
    logContext: Record<string, unknown>;
    logLabel: string;
  },
): Promise<Awaited<ReturnType<CreateStreamFn>> | null> {
  try {
    return await withRetry(createStream);
  } catch (err) {
    log.error(
      {
        ...opts.logContext,
        error: err instanceof Error ? err.message : err,
      },
      opts.logLabel,
    );

    const category = classifyError(err);
    let message = opts.errorMessage;
    if (category === 'timeout' && opts.timeoutMessage) {
      message = opts.timeoutMessage;
    } else if (category === 'rate_limited' && opts.rateLimitMessage) {
      message = opts.rateLimitMessage;
    }

    await opts.stream.writeSSE({
      data: JSON.stringify({
        type: 'error',
        message,
      }),
      event: 'message',
    });
    return null;
  }
}
