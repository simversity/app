import type { Dispatch, MutableRefObject } from 'react';
import { ApiError } from '@/lib/api';
import { CONNECTION_LOST_MESSAGE, STREAM_TIMEOUT_MS } from '@/lib/constants';
import { isAbortError } from '@/lib/error-utils';
import type { StreamingAction } from './useStreamingChat';

export type SSEDoneEvent = {
  type: 'done';
  messageId?: string;
  agentId?: string;
  agentName?: string;
  truncated?: boolean;
  /** When true, another agent will respond next within the same SSE connection */
  multiAgentContinue?: boolean;
};

export type SSENudgeEvent = {
  type: 'observer_nudge';
  text: string;
};

export type SSEToolCallEvent = {
  type: 'tool_call';
  name: string;
  arguments: Record<string, unknown>;
};

type SSECallbacks = {
  onDelta: (text: string) => void;
  onDone?: (data: SSEDoneEvent) => void;
  onError?: (message: string) => void;
  onNudge?: (data: SSENudgeEvent) => void;
  onToolCall?: (data: SSEToolCallEvent) => void;
};

/**
 * Parse an SSE response body, calling callbacks for each event type.
 */
export async function readSSEStream(
  response: Response,
  callbacks: SSECallbacks,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      processSSELine(line, callbacks);
    }
  }

  // Flush the decoder and process any remaining buffered data
  buffer += decoder.decode();
  if (buffer.trim()) {
    processSSELine(buffer, callbacks);
  }
}

function processSSELine(line: string, callbacks: SSECallbacks): void {
  if (line.startsWith('data:')) {
    const jsonStr = line.slice(5).trim();
    if (!jsonStr) return;
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.type === 'delta') {
        callbacks.onDelta(parsed.text);
      } else if (parsed.type === 'done') {
        callbacks.onDone?.(parsed);
      } else if (parsed.type === 'tool_call') {
        callbacks.onToolCall?.(parsed);
      } else if (parsed.type === 'observer_nudge') {
        callbacks.onNudge?.(parsed);
      } else if (parsed.type === 'error') {
        throw new Error(parsed.message);
      }
    } catch (e) {
      if (e instanceof SyntaxError) {
        if (import.meta.env.DEV)
          console.warn('SSE: failed to parse data line:', jsonStr);
        return;
      }
      throw e;
    }
  }
}

/**
 * POST to a streaming SSE endpoint with abort/timeout handling.
 * Returns the parsed response or throws on error.
 */
export async function fetchSSE(
  url: string,
  body: Record<string, unknown>,
  opts: SSECallbacks & {
    abortRef: MutableRefObject<AbortController | null>;
    timeoutMs?: number;
  },
): Promise<void> {
  opts.abortRef.current?.abort();
  const controller = new AbortController();
  opts.abortRef.current = controller;

  // Inactivity-based timeout: resets on each received chunk so long-running
  // streams (e.g. post-conversation observer reports) aren't killed prematurely.
  const inactivityMs = opts.timeoutMs ?? STREAM_TIMEOUT_MS;
  let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const resetTimer = () => {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, inactivityMs);
  };
  resetTimer();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include',
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let errorData: { error?: string } = {};
      try {
        errorData = JSON.parse(text);
      } catch {
        if (import.meta.env.DEV && text) {
          console.warn('SSE error response (non-JSON):', text);
        }
      }
      throw new ApiError(
        errorData.error || `Request failed: ${res.status}`,
        res.status,
      );
    }

    // Reset timer when the response starts streaming
    resetTimer();

    const wrappedCallbacks: SSECallbacks = {
      ...opts,
      onDelta: (text) => {
        resetTimer();
        opts.onDelta(text);
      },
    };

    await readSSEStream(res, wrappedCallbacks);
  } catch (err) {
    if (isAbortError(err)) {
      if (timedOut) {
        throw new Error('Response timed out. Please try again.');
      }
      return; // User-initiated abort — caller handles gracefully
    }
    throw err;
  } finally {
    clearTimeout(inactivityTimer);
  }
}

/**
 * Send a user message and stream the assistant response via SSE.
 * Handles dispatch lifecycle: ADD_USER_MESSAGE → STREAM_START → chunks → STREAM_END.
 * Used by both useConversation and useObserver to eliminate duplication.
 *
 * For multi-agent scenarios, the server sends multiple agent responses within
 * a single SSE connection. Each intermediate agent's `done` event includes
 * `multiAgentContinue: true`, signaling that another STREAM_START/END cycle
 * follows for the next agent.
 */
export async function sendStreamingMessage(
  url: string,
  content: string,
  dispatch: Dispatch<StreamingAction>,
  abortRef: MutableRefObject<AbortController | null>,
): Promise<void> {
  const userMsgId = crypto.randomUUID();
  dispatch({ type: 'ADD_USER_MESSAGE', id: userMsgId, content });

  let currentMsgId = crypto.randomUUID();
  dispatch({ type: 'STREAM_START', id: currentMsgId });

  let lastDoneEvent: SSEDoneEvent | undefined;
  try {
    await fetchSSE(
      url,
      { content },
      {
        abortRef,
        onDelta: (text) =>
          dispatch({ type: 'STREAM_CHUNK', id: currentMsgId, text }),
        onToolCall: (data) =>
          dispatch({
            type: 'TOOL_CALL',
            id: currentMsgId,
            name: data.name,
            arguments: data.arguments,
          }),
        onDone: (data) => {
          lastDoneEvent = data;
          // Finalize current agent's message
          dispatch({
            type: 'STREAM_END',
            id: currentMsgId,
            serverId: data.messageId,
            agentId: data.agentId,
            agentName: data.agentName,
          });
          // If another agent follows, start a new streaming message
          if (data.multiAgentContinue) {
            currentMsgId = crypto.randomUUID();
            dispatch({ type: 'STREAM_START', id: currentMsgId });
          }
        },
        onNudge: (data) => {
          dispatch({
            type: 'NUDGE',
            id: crypto.randomUUID(),
            text: data.text,
          });
        },
      },
    );
    if (!lastDoneEvent) {
      throw new Error(CONNECTION_LOST_MESSAGE);
    }
    // If the stream ended after a multiAgentContinue done (connection dropped
    // between agents), clean up the dangling empty message that was started
    // for the next agent.
    if (lastDoneEvent.multiAgentContinue) {
      dispatch({ type: 'REMOVE_MESSAGE', id: currentMsgId });
    }
  } catch (err) {
    dispatch({ type: 'REMOVE_MESSAGE', id: currentMsgId });
    // Don't remove the user message — it was already saved server-side
    dispatch({
      type: 'ERROR',
      message: err instanceof Error ? err.message : 'Stream failed',
    });
  }
}
