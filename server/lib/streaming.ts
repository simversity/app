import { count as countFn, eq, sql } from 'drizzle-orm';
import type { SSEStreamingApi } from 'hono/streaming';
import type { OpenAI } from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { openai } from '../ai/client';
import { db } from '../db';
import { conversation, message, observerMessage } from '../db/schema';
import { INACTIVITY_TIMEOUT_MS, MAX_RESPONSE_CHARS } from './constants';
import { log } from './logger';
import { withRetry } from './retry';
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
  /**
   * Tool-calling continuation: when the model stops to call tools
   * (finish_reason="tool_calls"), acknowledge them and continue generating.
   * Requires model, messages, and tools to make follow-up API calls.
   */
  toolContinuation?: {
    model: string;
    messages: Record<string, unknown>[];
    tools: ChatCompletionTool[];
    maxTokens: number;
  };
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

export type ToolCallAccumulator = {
  id: string;
  name: string;
  arguments: string;
};
export type ParsedToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

/** Cap tool-call continuation rounds to prevent runaway loops from chatty models. */
const MAX_TOOL_ROUNDS = 5;

/**
 * Stream one round of AI output. Returns accumulated text, tool calls,
 * and the finish reason. Does NOT save to DB — the caller handles that.
 */
export async function streamOneRound(
  aiStream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  opts: {
    stream: SSEStreamingApi;
    abortController?: AbortController;
    conversationId: string;
    existingChars: number;
  },
): Promise<{
  chunks: string[];
  toolAccumulators: Map<number, ToolCallAccumulator>;
  finishReason: string | null;
  responseChars: number;
  aborted: boolean;
}> {
  const chunks: string[] = [];
  const toolAccumulators = new Map<number, ToolCallAccumulator>();
  let finishReason: string | null = null;
  let responseChars = opts.existingChars;
  let inactivityTimer: ReturnType<typeof setTimeout> | undefined;

  const resetTimer = () => {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      opts.abortController?.abort();
    }, INACTIVITY_TIMEOUT_MS);
  };

  try {
    resetTimer();
    for await (const chunk of aiStream) {
      resetTimer();
      if (opts.stream.aborted) {
        opts.abortController?.abort();
        return {
          chunks,
          toolAccumulators,
          finishReason,
          responseChars,
          aborted: true,
        };
      }

      let text: string | undefined | null;
      let chunkFinishReason: string | null = null;
      // Cast needed to handle non-OpenAI providers (e.g. Anthropic) whose
      // chunks have a different shape (content_block_delta, message_delta).
      const raw = chunk as unknown as Record<string, unknown>;

      if (chunk.choices?.[0]) {
        const choice = chunk.choices[0];
        text = choice.delta?.content;
        chunkFinishReason = choice.finish_reason ?? null;

        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const idx = tc.index ?? 0;
            let acc = toolAccumulators.get(idx);
            if (!acc) {
              if (!tc.id) {
                log.warn(
                  { index: idx },
                  'Tool call chunk missing ID — assigning synthetic ID',
                );
              }
              acc = { id: tc.id ?? '', name: '', arguments: '' };
              toolAccumulators.set(idx, acc);
            }
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name = tc.function.name;
            if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          }
        }
      } else if (raw.type === 'content_block_delta') {
        const delta = raw.delta as { text?: string } | undefined;
        text = delta?.text;
      } else if (raw.type === 'message_delta') {
        const delta = raw.delta as { stop_reason?: string } | undefined;
        chunkFinishReason = delta?.stop_reason ?? null;
      } else {
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
        finishReason =
          chunkFinishReason === 'max_tokens' ? 'length' : chunkFinishReason;
      }
    }
  } finally {
    clearTimeout(inactivityTimer);
  }

  return {
    chunks,
    toolAccumulators,
    finishReason,
    responseChars,
    aborted: false,
  };
}

/** Parse accumulated tool call arguments and emit SSE events. */
export async function emitToolCalls(
  accumulators: Map<number, ToolCallAccumulator>,
  stream: SSEStreamingApi,
): Promise<ParsedToolCall[]> {
  const parsed: ParsedToolCall[] = [];
  for (const [, acc] of accumulators) {
    if (!acc.name) continue;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(acc.arguments);
    } catch {
      log.warn(
        { name: acc.name, raw: acc.arguments },
        'Failed to parse tool call arguments — skipping emit',
      );
      continue;
    }
    parsed.push({ name: acc.name, arguments: args });
    await stream.writeSSE({
      data: JSON.stringify({
        type: 'tool_call',
        name: acc.name,
        arguments: args,
      }),
      event: 'message',
    });
  }
  return parsed;
}

async function streamAndSaveAIResponseInner(
  opts: StreamAndSaveOpts,
): Promise<void> {
  const tbl = tables[opts.table];
  const allChunks: string[] = [];
  const allToolCalls: ParsedToolCall[] = [];
  let finalFinishReason: string | null = null;
  let currentStream = opts.aiStream;
  const continuationMessages = opts.toolContinuation?.messages
    ? [...opts.toolContinuation.messages]
    : [];

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const result = await streamOneRound(currentStream, {
        stream: opts.stream,
        abortController: opts.abortController,
        conversationId: opts.conversationId,
        existingChars: allChunks.join('').length,
      });

      if (result.aborted) return;
      allChunks.push(...result.chunks);

      // Emit tool calls as SSE events
      const roundToolCalls = await emitToolCalls(
        result.toolAccumulators,
        opts.stream,
      );
      allToolCalls.push(...roundToolCalls);
      finalFinishReason = result.finishReason;

      // If the model wants to call tools and we can continue, do so
      if (
        result.finishReason === 'tool_calls' &&
        opts.toolContinuation &&
        roundToolCalls.length > 0 &&
        round < MAX_TOOL_ROUNDS
      ) {
        // Build assistant message with tool calls for continuation
        const assistantToolCalls = [...result.toolAccumulators.values()]
          .filter((a) => a.name)
          .map((a, idx) => ({
            id: a.id || `call_${idx}`,
            type: 'function' as const,
            function: { name: a.name, arguments: a.arguments },
          }));

        continuationMessages.push({
          role: 'assistant',
          content: result.chunks.join('') || null,
          tool_calls: assistantToolCalls,
        });

        // Add tool results — simple acknowledgments for annotation tools
        for (const tc of assistantToolCalls) {
          continuationMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: 'Noted.',
          });
        }

        // Make continuation call
        // TODO(token-budget): Each continuation round currently receives the full
        // maxTokens budget. Over MAX_TOOL_ROUNDS rounds the model could produce up
        // to MAX_TOOL_ROUNDS * maxTokens tokens total. The MAX_RESPONSE_CHARS cap
        // (512KB) provides a backstop, but a correct fix would decrement max_tokens
        // by the tokens already generated. This requires tracking output tokens per
        // round (not just character count) and understanding the model's token
        // accounting for tool call overhead. Leaving as-is until we observe runaway
        // token spend in practice.
        const cont = opts.toolContinuation;
        currentStream = await withRetry(() =>
          openai.chat.completions.create(
            {
              model: cont.model,
              max_tokens: cont.maxTokens,
              messages:
                continuationMessages as unknown as ChatCompletionMessageParam[],
              tools: cont.tools,
              tool_choice: 'auto',
              stream: true as const,
            },
            { signal: opts.abortController?.signal },
          ),
        );
        continue;
      }

      // No more tool calls — done streaming
      break;
    }
  } catch (err) {
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
  }

  if (finalFinishReason === 'length') {
    log.warn(
      { conversationId: opts.conversationId },
      'AI response truncated (finish_reason=length)',
    );
  }

  const fullResponse = allChunks.join('');

  if (!fullResponse.trim() && allToolCalls.length === 0) {
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
          toolCalls:
            allToolCalls.length > 0 ? JSON.stringify(allToolCalls) : null,
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
        ...(finalFinishReason === 'length' ? { truncated: true } : {}),
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
