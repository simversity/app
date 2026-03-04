import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { MutableRefObject } from 'react';
import { fetchSSE, readSSEStream } from '../sse-stream';

/** Build a minimal Response whose body yields the given chunks. */
function fakeResponse(...chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream);
}

describe('readSSEStream', () => {
  test('parses delta events', async () => {
    const res = fakeResponse(
      'data: {"type":"delta","text":"Hello"}\n',
      'data: {"type":"delta","text":" world"}\n',
    );
    const deltas: string[] = [];
    await readSSEStream(res, {
      onDelta: (t) => deltas.push(t),
    });
    expect(deltas).toEqual(['Hello', ' world']);
  });

  test('parses done event', async () => {
    const res = fakeResponse(
      'data: {"type":"done","messageId":"m1","agentId":"a1","agentName":"Riley"}\n',
    );
    let received: Record<string, unknown> | undefined;
    await readSSEStream(res, {
      onDelta: () => {},
      onDone: (data) => {
        received = data;
      },
    });
    expect(received).toBeDefined();
    expect(received?.messageId).toBe('m1');
    expect(received?.agentId).toBe('a1');
    expect(received?.agentName).toBe('Riley');
  });

  test('throws on error events', async () => {
    const res = fakeResponse(
      'data: {"type":"error","message":"Something broke"}\n',
    );
    await expect(readSSEStream(res, { onDelta: () => {} })).rejects.toThrow(
      'Something broke',
    );
  });

  test('skips malformed JSON without crashing', async () => {
    const res = fakeResponse(
      'data: {not valid json}\n',
      'data: {"type":"delta","text":"ok"}\n',
    );
    const deltas: string[] = [];
    await readSSEStream(res, {
      onDelta: (t) => deltas.push(t),
    });
    expect(deltas).toEqual(['ok']);
  });

  test('handles data split across chunks', async () => {
    const res = fakeResponse('data: {"type":"del', 'ta","text":"split"}\n');
    const deltas: string[] = [];
    await readSSEStream(res, {
      onDelta: (t) => deltas.push(t),
    });
    expect(deltas).toEqual(['split']);
  });

  test('ignores empty lines and comment lines', async () => {
    const res = fakeResponse(
      '\n',
      ': this is a comment\n',
      'data: {"type":"delta","text":"hi"}\n',
      '\n',
    );
    const deltas: string[] = [];
    await readSSEStream(res, {
      onDelta: (t) => deltas.push(t),
    });
    expect(deltas).toEqual(['hi']);
  });

  test('ignores empty data field', async () => {
    const res = fakeResponse('data: \n', 'data:\n');
    const onDelta = mock(() => {});
    await readSSEStream(res, { onDelta });
    expect(onDelta).not.toHaveBeenCalled();
  });

  test('flushes remaining buffer at end of stream', async () => {
    // Final line with no trailing newline
    const res = fakeResponse('data: {"type":"delta","text":"final"}');
    const deltas: string[] = [];
    await readSSEStream(res, {
      onDelta: (t) => deltas.push(t),
    });
    expect(deltas).toEqual(['final']);
  });

  test('throws on response with no body', async () => {
    const res = new Response(null);
    await expect(readSSEStream(res, { onDelta: () => {} })).rejects.toThrow(
      'No response body',
    );
  });

  test('handles multiple events in a single chunk', async () => {
    const res = fakeResponse(
      'data: {"type":"delta","text":"a"}\ndata: {"type":"delta","text":"b"}\ndata: {"type":"done","messageId":"m1"}\n',
    );
    const deltas: string[] = [];
    let doneId: string | undefined;
    await readSSEStream(res, {
      onDelta: (t) => deltas.push(t),
      onDone: (data) => {
        doneId = data.messageId;
      },
    });
    expect(deltas).toEqual(['a', 'b']);
    expect(doneId).toBe('m1');
  });

  test('handles done event with truncated flag', async () => {
    const res = fakeResponse(
      'data: {"type":"done","messageId":"m1","truncated":true}\n',
    );
    let truncated: boolean | undefined;
    await readSSEStream(res, {
      onDelta: () => {},
      onDone: (data) => {
        truncated = data.truncated;
      },
    });
    expect(truncated).toBe(true);
  });
});

/**
 * Build a Response whose stream is abortable via the given signal.
 * Chunks are delivered with `delayMs` between them.
 * If no chunks are provided, the stream hangs until aborted.
 */
function abortableResponse(
  signal: AbortSignal,
  chunks: string[] = [],
  delayMs = 0,
): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (signal.aborted) {
        controller.error(new DOMException('Aborted', 'AbortError'));
        return;
      }
      if (i < chunks.length) {
        if (i > 0 && delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        if (signal.aborted) {
          controller.error(new DOMException('Aborted', 'AbortError'));
          return;
        }
        controller.enqueue(encoder.encode(chunks[i++]));
      } else if (chunks.length === 0) {
        // Hang until aborted
        await new Promise<void>((_, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        });
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, { status: 200 });
}

function makeAbortRef(): MutableRefObject<AbortController | null> {
  return { current: null };
}

describe('fetchSSE', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('throws timeout error when no chunks arrive within timeoutMs', async () => {
    // Mock fetch to return a hanging stream that respects abort
    globalThis.fetch = mock((_url: string, init: RequestInit) => {
      const res = abortableResponse(init.signal as AbortSignal);
      return Promise.resolve(res);
    }) as unknown as typeof fetch;
    const abortRef = makeAbortRef();

    await expect(
      fetchSSE(
        '/api/test',
        { content: 'hello' },
        {
          abortRef,
          timeoutMs: 50,
          onDelta: () => {},
        },
      ),
    ).rejects.toThrow('Response timed out. Please try again.');
  });

  test('resolves silently on user-initiated abort', async () => {
    globalThis.fetch = mock((_url: string, init: RequestInit) => {
      const res = abortableResponse(init.signal as AbortSignal);
      return Promise.resolve(res);
    }) as unknown as typeof fetch;
    const abortRef = makeAbortRef();

    const promise = fetchSSE(
      '/api/test',
      { content: 'hello' },
      {
        abortRef,
        timeoutMs: 5000,
        onDelta: () => {},
      },
    );

    // Give fetchSSE a tick to set up the controller and start streaming
    await new Promise((r) => setTimeout(r, 10));
    // User-initiated abort (not timeout)
    abortRef.current?.abort();

    // Should resolve without throwing
    await expect(promise).resolves.toBeUndefined();
  });

  test('resets timer on each chunk so active streams do not timeout', async () => {
    // Each chunk arrives at 30ms intervals, timeout is 50ms.
    // Without timer resets, the 3rd chunk would arrive at 90ms > 50ms timeout.
    const chunks = [
      'data: {"type":"delta","text":"a"}\n',
      'data: {"type":"delta","text":"b"}\n',
      'data: {"type":"delta","text":"c"}\n',
      'data: {"type":"done","messageId":"m1"}\n',
    ];
    globalThis.fetch = mock((_url: string, init: RequestInit) => {
      const res = abortableResponse(init.signal as AbortSignal, chunks, 30);
      return Promise.resolve(res);
    }) as unknown as typeof fetch;
    const abortRef = makeAbortRef();
    const deltas: string[] = [];

    await fetchSSE(
      '/api/test',
      { content: 'hello' },
      {
        abortRef,
        timeoutMs: 50,
        onDelta: (t) => deltas.push(t),
      },
    );

    expect(deltas).toEqual(['a', 'b', 'c']);
  });
});
