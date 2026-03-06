import { count as countFn, eq, sql } from 'drizzle-orm';
import type { SSEStreamingApi } from 'hono/streaming';
import type { OpenAI } from 'openai';
import { db } from '../db';
import { conversation, message, observerMessage } from '../db/schema';
import { INACTIVITY_TIMEOUT_MS, MAX_RESPONSE_CHARS } from './constants';
import { log } from './logger';
import { trackStream, untrackStream } from './shutdown';

type CounterField = 'messageCount' | 'observerMessageCount';
type MessageTable = 'message' | 'observerMessage';
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const tables = { message, observerMessage } as const;

/** Insert a message row and atomically bump the conversation's counter. */
async function insertMessageAndBumpCounter(
  tx: Tx,
  tbl: (typeof tables)[MessageTable],
  values: Record<string, unknown>,
  conversationId: string,
  counterField: CounterField,
): Promise<void> {
  await tx.insert(tbl).values(values as typeof tbl.$inferInsert);
  await tx
    .update(conversation)
    .set({
      [counterField]: sql`${conversation[counterField]} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(conversation.id, conversationId));
}

/**
 * Save a user message with transactional sortOrder counting, then increment
 * the conversation's counter field.
 *
 * TODO(postgres): sortOrder is computed by counting existing rows inside a
 * transaction. This is safe under SQLite's serialized write model (only one
 * writer at a time). If migrating to Postgres or another concurrent DB,
 * replace with SELECT ... FOR UPDATE or a database sequence to prevent
 * duplicate sortOrder values.
 *
 * Returns the sortOrder assigned to the saved message.
 */
export async function saveUserMessage(opts: {
  table: MessageTable;
  conversationId: string;
  messageId: string;
  content: string;
  counterField: CounterField;
  /** Extra columns to include in the insert (e.g. agentId) */
  extra?: Record<string, unknown>;
  /** Optional check to run inside the transaction before saving (e.g. status verification) */
  preCheck?: (tx: Tx) => Promise<void>;
}): Promise<number> {
  const tbl = tables[opts.table];
  let sortOrder = 0;
  await db.transaction(async (tx) => {
    if (opts.preCheck) {
      await opts.preCheck(tx);
    }
    const [{ total }] = await tx
      .select({ total: countFn() })
      .from(tbl)
      .where(eq(tbl.conversationId, opts.conversationId));
    sortOrder = total;
    await insertMessageAndBumpCounter(
      tx,
      tbl,
      {
        id: opts.messageId,
        conversationId: opts.conversationId,
        role: 'user',
        content: opts.content,
        sortOrder,
        ...opts.extra,
      },
      opts.conversationId,
      opts.counterField,
    );
  });
  return sortOrder;
}

/** Options for streaming an AI response and saving it. */
export type StreamAndSaveOpts = {
  stream: SSEStreamingApi;
  aiStream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  conversationId: string;
  /** Which table to insert the AI message into */
  table: MessageTable;
  counterField: CounterField;
  /** sortOrder for the AI message (typically teacherSortOrder + 1) */
  sortOrder: number;
  /** Error message shown to user on AI failure */
  errorLabel: string;
  /** Error message shown to user on empty response */
  emptyLabel: string;
  /** Extra columns for the AI message insert (e.g. agentId) */
  extraInsert?: Record<string, unknown>;
  /** Extra fields to include in the SSE `done` event */
  extraDone?: Record<string, unknown>;
  /** Extra work to run inside the save transaction (e.g. progress upsert) */
  afterSave?: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    aiMsgId: string,
  ) => Promise<void>;
  /** AbortController to cancel the AI stream when the client disconnects */
  abortController?: AbortController;
  /** User ID for per-user stream tracking */
  userId?: string;
  /** Called when the AI response fails or is empty, to release a daily budget slot */
  onAIFailure?: () => void;
  /** Called after a successful save with the full AI response text */
  onComplete?: (fullText: string) => void;
};

/**
 * Stream an AI response to the client via SSE, then save the result.
 * On error or empty response, sends an SSE error event. The user message
 * counter (incremented by saveUserMessage) is left intact since the user
 * message was legitimately saved.
 */
export async function streamAndSaveAIResponse(
  opts: StreamAndSaveOpts,
): Promise<void> {
  const streamTracker = trackStream(opts.userId);
  // Abort the AI stream if the server is shutting down
  const onShutdown = () => opts.abortController?.abort();
  streamTracker.signal.addEventListener('abort', onShutdown);
  try {
    await streamAndSaveAIResponseInner(opts);
  } finally {
    streamTracker.signal.removeEventListener('abort', onShutdown);
    untrackStream(streamTracker, opts.userId);
  }
}

async function streamAndSaveAIResponseInner(
  opts: StreamAndSaveOpts,
): Promise<void> {
  const tbl = tables[opts.table];
  const chunks: string[] = [];
  let finishReason: string | null = null;
  let responseChars = 0;
  let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
  const resetInactivityTimer = () => {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      opts.abortController?.abort();
    }, INACTIVITY_TIMEOUT_MS);
  };

  try {
    resetInactivityTimer();
    for await (const chunk of opts.aiStream) {
      resetInactivityTimer();
      // If the client disconnected, abort the AI stream to stop wasting tokens
      if (opts.stream.aborted) {
        opts.abortController?.abort();
        return;
      }

      // Extract text and finish reason from either OpenAI or Anthropic streaming format.
      // NEAR AI Cloud returns Anthropic-native SSE for Claude models.
      let text: string | undefined | null;
      let chunkFinishReason: string | null = null;
      const raw = chunk as unknown as Record<string, unknown>;

      if (chunk.choices?.[0]) {
        // OpenAI format: { choices: [{ delta: { content }, finish_reason }] }
        const choice = chunk.choices[0];
        text = choice.delta?.content;
        chunkFinishReason = choice.finish_reason ?? null;
      } else if (raw.type === 'content_block_delta') {
        // Anthropic format: { type: "content_block_delta", delta: { text } }
        const delta = raw.delta as { text?: string } | undefined;
        text = delta?.text;
      } else if (raw.type === 'message_delta') {
        // Anthropic format: { type: "message_delta", delta: { stop_reason } }
        const delta = raw.delta as { stop_reason?: string } | undefined;
        chunkFinishReason = delta?.stop_reason ?? null;
      } else {
        if (chunks.length === 0) {
          log.debug(
            {
              chunkKeys: Object.keys(chunk),
              chunk: JSON.stringify(chunk).slice(0, 500),
            },
            'AI stream chunk without choices',
          );
        }
        continue;
      }

      if (text) {
        responseChars += text.length;
        if (responseChars > MAX_RESPONSE_CHARS) {
          finishReason = 'length';
          opts.abortController?.abort();
          break;
        }
        chunks.push(text);
        await opts.stream.writeSSE({
          data: JSON.stringify({ type: 'delta', text }),
          event: 'message',
        });
      }
      if (chunkFinishReason) {
        // Normalize Anthropic stop reasons to OpenAI equivalents
        finishReason =
          chunkFinishReason === 'max_tokens' ? 'length' : chunkFinishReason;
      }
    }
  } catch (err) {
    // Ignore abort errors when client disconnected
    if (opts.stream.aborted) return;
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTimeout =
      errMsg.toLowerCase().includes('timeout') ||
      errMsg.toLowerCase().includes('timed out');
    log.error(
      {
        conversationId: opts.conversationId,
        userId: opts.userId,
        error: errMsg,
        isTimeout,
      },
      'AI stream error',
    );
    opts.onAIFailure?.();
    await saveTombstone(tbl, opts);
    await opts.stream.writeSSE({
      data: JSON.stringify({
        type: 'error',
        message: isTimeout
          ? opts.errorLabel.replace(
              'trouble responding',
              'took too long to respond',
            )
          : opts.errorLabel,
      }),
      event: 'message',
    });
    return;
  } finally {
    clearTimeout(inactivityTimer);
  }

  if (finishReason === 'length') {
    log.warn(
      { conversationId: opts.conversationId },
      'AI response truncated (finish_reason=length)',
    );
  }

  const fullResponse = chunks.join('');

  if (!fullResponse.trim()) {
    opts.onAIFailure?.();
    await saveTombstone(tbl, opts);
    await opts.stream.writeSSE({
      data: JSON.stringify({ type: 'error', message: opts.emptyLabel }),
      event: 'message',
    });
    return;
  }

  try {
    const aiMsgId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await insertMessageAndBumpCounter(
        tx,
        tbl,
        {
          id: aiMsgId,
          conversationId: opts.conversationId,
          role: 'assistant',
          content: fullResponse,
          sortOrder: opts.sortOrder,
          ...opts.extraInsert,
        },
        opts.conversationId,
        opts.counterField,
      );
      if (opts.afterSave) {
        await opts.afterSave(tx, aiMsgId);
      }
    });

    opts.onComplete?.(fullResponse);

    await opts.stream.writeSSE({
      data: JSON.stringify({
        type: 'done',
        messageId: aiMsgId,
        ...(finishReason === 'length' ? { truncated: true } : {}),
        ...opts.extraDone,
      }),
      event: 'message',
    });
  } catch (err) {
    log.error(
      {
        conversationId: opts.conversationId,
        userId: opts.userId,
        error: err instanceof Error ? err.message : err,
      },
      'Failed to save AI response',
    );
    // Release the budget slot — the user got an error despite successful streaming
    opts.onAIFailure?.();
    await opts.stream.writeSSE({
      data: JSON.stringify({
        type: 'error',
        message: 'Response received but failed to save',
      }),
      event: 'message',
    });
  }
}

/**
 * Save a placeholder assistant message so the conversation history doesn't
 * have consecutive user messages after a failed AI response. Best-effort —
 * failures are logged but not propagated.
 */
async function saveTombstone(
  tbl: (typeof tables)[MessageTable],
  opts: Pick<
    StreamAndSaveOpts,
    'conversationId' | 'sortOrder' | 'counterField' | 'extraInsert'
  >,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await insertMessageAndBumpCounter(
        tx,
        tbl,
        {
          id: crypto.randomUUID(),
          conversationId: opts.conversationId,
          role: 'assistant',
          content: '[Could not generate a response. Please try again.]',
          sortOrder: opts.sortOrder,
          ...opts.extraInsert,
        },
        opts.conversationId,
        opts.counterField,
      );
    });
  } catch (err) {
    log.error(
      {
        conversationId: opts.conversationId,
        error: err instanceof Error ? err.message : err,
      },
      'Failed to save tombstone message',
    );
  }
}
