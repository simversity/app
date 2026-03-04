# Building SSE Streaming Endpoints

Guide for adding real-time streaming API endpoints following the existing conversation pattern.

## Server Side (Hono + NEAR AI Cloud)

### 1. Route Setup

```ts
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { openai } from '../ai/client';
import { env } from '../lib/env';
import { requireVerified } from '../middleware/auth';

const routes = new Hono();
routes.use('*', requireVerified);
```

`requireVerified` ensures the user is authenticated **and** has a verified email. Use `requireAuth` instead for endpoints where unverified users are acceptable (e.g. read-only profile data). All streaming AI endpoints should use `requireVerified`.

### 2. Streaming Endpoint Pattern

The pattern is: validate request, prepare data, then return `streamSSE()`. The inline example below shows the full flow; in practice, use `saveUserMessage()` and `streamAndSaveAIResponse()` from `server/lib/streaming.ts` which encapsulate this pattern with proper shutdown tracking and counter management:

```ts
routes.post('/:id/messages', async (c) => {
  const user = c.get('user') as { id: string };

  // 1. Validate input with Zod
  const body = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request' }, 400);
  }

  // 2. Save user input to DB BEFORE streaming, inside a transaction with messageCount
  await db.transaction(async (tx) => {
    await tx.insert(message).values({ /* ... */ });
    await tx
      .update(conversation)
      .set({ messageCount: sql`${conversation.messageCount} + 1` })
      .where(eq(conversation.id, conversationId));
  });

  // 3. Stream the AI response
  return streamSSE(c, async (stream) => {
    let fullResponse = '';

    try {
      const response = await openai.chat.completions.create({
        model: env.NEARAI_MODEL,
        max_tokens: env.NEARAI_MAX_TOKENS,
        messages: chatMessages,
        stream: true,
      });

      for await (const chunk of response) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          fullResponse += text;
          await stream.writeSSE({
            data: JSON.stringify({ type: 'delta', text }),
            event: 'message',
          });
        }
      }
    } catch (err) {
      console.error('AI stream error:', err);
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'error',
          message:
            'The student is having trouble responding. Please try again.',
        }),
        event: 'message',
      });
      return;
    }

    // 4. Save complete response AFTER stream finishes, in a transaction
    try {
      const aiMsg = {
        id: crypto.randomUUID(),
        conversationId,
        role: 'assistant',
        content: fullResponse,
        agentId: agentPersonaId,
        sortOrder: teacherSortOrder + 1,
      };
      await db.transaction(async (tx) => {
        await tx.insert(message).values(aiMsg);
        await tx
          .update(conversation)
          .set({ messageCount: sql`${conversation.messageCount} + 1` })
          .where(eq(conversation.id, conversationId));
        await tx
          .insert(progress)
          .values({ /* userId, courseId, scenarioId, status: 'in_progress' */ })
          .onConflictDoUpdate({
            target: [progress.userId, progress.scenarioId],
            set: { updatedAt: new Date() },
          });
      });

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'done',
          messageId: aiMsg.id,
          agentId: agentPersonaId,
          agentName: agentPersonaName,
        }),
        event: 'message',
      });
    } catch (err) {
      console.error('Failed to save:', err);
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'error',
          message: 'Response received but failed to save',
        }),
        event: 'message',
      });
    }
  });
});
```

### 3. SSE Event Format

All events use `event: 'message'` with JSON `data`:

| Event Type | Shape | When |
|---|---|---|
| `delta` | `{ type: 'delta', text: string }` | Each token chunk |
| `done` | `{ type: 'done', messageId?: string, agentId?: string, agentName?: string, truncated?: boolean }` | Stream complete, saved to DB. Conversation endpoints include `agentId`/`agentName`; observer endpoints omit them. `truncated: true` when the model hit `max_tokens`. |
| `error` | `{ type: 'error', message: string }` | AI failure or save failure |
| `observer_nudge` | `{ type: 'observer_nudge', text: string }` | Inline observer nudge during multi-agent turns |

### 4. Rate Limiting

Use the `createRateLimiter()` factory from `server/lib/rate-limit.ts`:

```ts
import { createRateLimiter } from '../lib/rate-limit';

// Per-user rate limiting: max 20 messages/minute (sliding window)
const checkRateLimit = createRateLimiter(20);

// Per-user rate limiting: max 5 new conversations/minute
const checkStartRate = createRateLimiter(5);
```

Check before streaming:

```ts
if (!checkRateLimit(user.id)) {
  return c.json({ error: 'Rate limit exceeded. Please slow down.' }, 429);
}
```

The factory handles cleanup internally (evicts stale entries, caps at 10K map entries).

In addition to per-user rate limiting, check the global daily message budget before streaming. The budget checker is `null` when `DAILY_MESSAGE_LIMIT` is unset (unlimited):

```ts
import { checkDailyBudget } from '../lib/shared-budgets';

if (checkDailyBudget && !checkDailyBudget(user.id)) {
  return c.json({ error: 'Daily message limit reached' }, 429);
}
```

### Streaming Sequence Diagram

```
Browser                          Server                         NEAR AI Cloud
  │                                │                                │
  │  POST /api/.../messages        │                                │
  │  { content: "..." }            │                                │
  │──────────────────────────────► │                                │
  │                                │  saveUserMessage()             │
  │                                │  (INSERT message, bump count)  │
  │                                │                                │
  │                                │  openai.chat.completions       │
  │                                │  { stream: true }              │
  │                                │──────────────────────────────► │
  │                                │                                │
  │  SSE: { type: "delta" }        │  ◄── chunk ──────────────────  │
  │  ◄─────────────────────────── │                                │
  │  SSE: { type: "delta" }        │  ◄── chunk ──────────────────  │
  │  ◄─────────────────────────── │                                │
  │  ...                           │  ...                           │
  │                                │                                │
  │                                │  ◄── [DONE] ─────────────────  │
  │                                │                                │
  │                                │  streamAndSaveAIResponse()     │
  │                                │  (INSERT message, UPSERT       │
  │                                │   progress, bump count)        │
  │                                │                                │
  │  SSE: { type: "done" }         │                                │
  │  ◄─────────────────────────── │                                │
  │                                │                                │

Hook Composition:

  useConversation ──┐
                    ├── useStreamingChat (shared reducer)
  useObserver ──────┘        │
                             ├── useSendMessage → sendStreamingMessage()
                             │        │
                             │        ├── fetchSSE()
                             │        └── readSSEStream()
                             │
                             └── StreamingStatus: idle → streaming → idle
```

## Client Side (React Hook)

### 1. State Machine

Both `useConversation` and `useObserver` share a common streaming state machine from `src/hooks/useStreamingChat.ts`:

```ts
type StreamingStatus = 'idle' | 'streaming' | 'error';

type StreamingAction =
  | { type: 'INIT'; conversationId?: string; messages: ChatMessage[] }
  | { type: 'ADD_USER_MESSAGE'; id: string; content: string }
  | { type: 'STREAM_START'; id: string; agentId?: string; agentName?: string }
  | { type: 'STREAM_CHUNK'; id: string; text: string }
  | { type: 'STREAM_END'; id: string; serverId?: string; agentId?: string; agentName?: string }
  | { type: 'REMOVE_MESSAGE'; id: string }
  | { type: 'NUDGE'; id: string; text: string }
  | { type: 'ERROR'; message: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESET' };
```

### 2. SSE Parsing

In practice, use `sendStreamingMessage()` from `src/hooks/sse-stream.ts` which handles the full dispatch lifecycle (`ADD_USER_MESSAGE` → `STREAM_START` → chunks → `STREAM_END`, with error rollback via `REMOVE_MESSAGE`). Both `useConversation` and `useObserver` use the shared `useSendMessage()` hook from `src/hooks/useStreamingChat.ts` which wraps this.

The underlying SSE parsing uses `readSSEStream()` and `fetchSSE()` from `src/hooks/sse-stream.ts`. The inline flow for reference:

```ts
import { fetchSSE } from '@/hooks/sse-stream';

await fetchSSE(
  `/api/conversations/${id}/messages`,
  { content },
  {
    abortRef,
    onDelta: (text) => dispatch({ type: 'STREAM_CHUNK', id: assistantMsgId, text }),
    onDone: (data) => {
      dispatch({
        type: 'STREAM_END',
        id: assistantMsgId,
        serverId: data.messageId,
        agentId: data.agentId,
        agentName: data.agentName,
      });
    },
  },
);
```

`fetchSSE` handles abort controllers, `credentials: 'include'`, and inactivity-based timeouts (resets on each chunk so long-running streams aren't killed prematurely).

### 3. Abort Controller

The `useStreamingChat()` hook manages the abort controller lifecycle. `fetchSSE()` handles abort/cancel automatically — previous streams are aborted before starting a new one, and cleanup runs on unmount:

```ts
const { state, dispatch, abortRef } = useStreamingChat();

// abortRef is managed by useStreamingChat:
// - Abort previous stream before starting a new one (fetchSSE does this)
// - Cleanup on unmount via useEffect
// - Abort errors return silently (not treated as errors)
```

## Key Principles

1. **Save user input before streaming** — never lose user data if the stream fails
2. **Save AI response after streaming** — accumulate the full response, then persist
3. **Use transactions for multi-table updates** — e.g. updating both `message` and `progress`
4. **Buffer SSE lines** — partial chunks may split mid-line; keep a buffer
5. **Handle three failure modes**: AI error (during stream), save error (after stream), abort (user navigated away)
6. **Check server capacity** — call `canAcceptStream()` from `server/lib/shutdown.ts` before starting a stream
7. **Wrap AI calls with retry** — use `withRetry()` from `server/lib/retry.ts` for transient API failures
8. **Trim message context** — use `trimMessagesToFit()` from `server/lib/token-estimate.ts` to stay within model context limits

## Key Files

- `server/routes/conversation-messages.ts` — Reference streaming endpoint (student messages)
- `server/routes/observer.ts` — Second streaming endpoint (observer feedback)
- `src/hooks/useStreamingChat.ts` — Shared state machine (`StreamingStatus`, `StreamingAction`, reducer, `useSendMessage`)
- `src/hooks/useConversation.ts` — Conversation SSE consumer (composes `useStreamingChat`)
- `src/hooks/useObserver.ts` — Observer SSE consumer (composes `useStreamingChat`)
- `src/hooks/sse-stream.ts` — SSE utilities (`readSSEStream`, `fetchSSE`, `sendStreamingMessage`)
- `server/lib/streaming.ts` — Shared `saveUserMessage()` and `streamAndSaveAIResponse()` utilities
- `server/lib/rate-limit.ts` — `createRateLimiter()` factory
- `server/lib/daily-budget.ts` — `checkDailyBudget()` global rate limit
- `server/lib/retry.ts` — `withRetry()` exponential backoff for AI API calls
- `server/lib/token-estimate.ts` — `trimMessagesToFit()` context window management
- `server/lib/shutdown.ts` — `canAcceptStream()`, `trackStream()`, `untrackStream()` graceful shutdown

## See Also

- `add-route.md` — For non-streaming API routes (CRUD endpoints)
- `deployment.md` — Graceful shutdown and `canAcceptStream()` in production
