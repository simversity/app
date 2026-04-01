import { describe, expect, test } from 'bun:test';
import type { OpenAI } from 'openai';
import {
  emitToolCalls,
  streamOneRound,
  type ToolCallAccumulator,
} from '../streaming';

// ---------------------------------------------------------------------------
// Helpers: mock SSE stream and OpenAI chunk generator
// ---------------------------------------------------------------------------

type SSEEvent = { data: string; event: string };

/** Subset of SSEStreamingApi used by streamOneRound / emitToolCalls. */
type StreamOpts = Parameters<typeof streamOneRound>[1];
type StreamLike = StreamOpts['stream'];

/** Test double that satisfies StreamLike and records emitted events. */
function createMockSSEStream(aborted = false) {
  const events: SSEEvent[] = [];
  const mock = {
    aborted,
    writeSSE: async (evt: SSEEvent) => {
      events.push(evt);
    },
    onAbort: () => {},
    events,
  };
  return mock as typeof mock & StreamLike;
}

type Chunk = OpenAI.Chat.Completions.ChatCompletionChunk;

/** Create an OpenAI-compatible streaming chunk with text delta. */
function textChunk(text: string, finishReason?: string | null): Chunk {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'test-model',
    choices: [
      {
        index: 0,
        delta: { content: text },
        finish_reason: (finishReason ??
          null) as Chunk['choices'][0]['finish_reason'],
        logprobs: null,
      },
    ],
  };
}

/** Create a chunk with tool call deltas. */
function toolCallChunk(
  toolCalls: {
    index?: number;
    id?: string;
    name?: string;
    arguments?: string;
  }[],
  finishReason?: string | null,
): Chunk {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'test-model',
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: toolCalls.map((tc) => ({
            index: tc.index ?? 0,
            id: tc.id,
            function: {
              name: tc.name ?? '',
              arguments: tc.arguments ?? '',
            },
            type: 'function' as const,
          })),
        },
        finish_reason: (finishReason ??
          null) as Chunk['choices'][0]['finish_reason'],
        logprobs: null,
      },
    ],
  };
}

/** Convert an array of chunks into an async iterable. */
async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

/** Helper to get a tool accumulator by index, throwing if missing. */
function getAcc(
  map: Map<number, ToolCallAccumulator>,
  idx: number,
): ToolCallAccumulator {
  const acc = map.get(idx);
  if (!acc) throw new Error(`No accumulator at index ${idx}`);
  return acc;
}

// ---------------------------------------------------------------------------
// streamOneRound tests
// ---------------------------------------------------------------------------

describe('streamOneRound', () => {
  test('accumulates text chunks and emits SSE deltas', async () => {
    const stream = createMockSSEStream();
    const chunks = [
      textChunk('Hello '),
      textChunk('world'),
      textChunk('!', 'stop'),
    ];

    const result = await streamOneRound(
      toAsyncIterable(chunks) as AsyncIterable<Chunk>,
      {
        stream,
        conversationId: 'test-conv',
        existingChars: 0,
      },
    );

    expect(result.chunks).toEqual(['Hello ', 'world', '!']);
    expect(result.finishReason).toBe('stop');
    expect(result.aborted).toBe(false);
    expect(result.responseChars).toBe(12);
    expect(result.toolAccumulators.size).toBe(0);

    // Should have emitted 3 SSE delta events
    expect(stream.events.length).toBe(3);
    for (const evt of stream.events) {
      const parsed = JSON.parse(evt.data);
      expect(parsed.type).toBe('delta');
    }
  });

  test('accumulates tool call arguments across chunks', async () => {
    const stream = createMockSSEStream();
    const chunks = [
      // First chunk: tool call starts with ID and name
      toolCallChunk([
        {
          index: 0,
          id: 'call_abc',
          name: 'express_confusion',
          arguments: '{"to',
        },
      ]),
      // Second chunk: arguments continue
      toolCallChunk([{ index: 0, arguments: 'pic":"ev' }]),
      // Third chunk: arguments end
      toolCallChunk([{ index: 0, arguments: 'olution"}' }], 'tool_calls'),
    ];

    const result = await streamOneRound(
      toAsyncIterable(chunks) as AsyncIterable<Chunk>,
      {
        stream,
        conversationId: 'test-conv',
        existingChars: 0,
      },
    );

    expect(result.chunks).toEqual([]);
    expect(result.finishReason).toBe('tool_calls');
    expect(result.toolAccumulators.size).toBe(1);

    const acc = getAcc(result.toolAccumulators, 0);
    expect(acc.id).toBe('call_abc');
    expect(acc.name).toBe('express_confusion');
    expect(acc.arguments).toBe('{"topic":"evolution"}');
  });

  test('assigns empty ID when tool call chunk has no id', async () => {
    const stream = createMockSSEStream();
    const chunks = [
      toolCallChunk(
        [{ index: 0, name: 'express_confusion', arguments: '{"topic":"x"}' }],
        'tool_calls',
      ),
    ];

    const result = await streamOneRound(
      toAsyncIterable(chunks) as AsyncIterable<Chunk>,
      {
        stream,
        conversationId: 'test-conv',
        existingChars: 0,
      },
    );

    const acc = getAcc(result.toolAccumulators, 0);
    expect(acc.id).toBe('');
    expect(acc.name).toBe('express_confusion');
  });

  test('handles multiple tool calls in parallel', async () => {
    const stream = createMockSSEStream();
    const chunks = [
      toolCallChunk(
        [
          {
            index: 0,
            id: 'call_1',
            name: 'express_confusion',
            arguments: '{"topic":"DNA"}',
          },
          {
            index: 1,
            id: 'call_2',
            name: 'ask_question',
            arguments: '{"question":"why?"}',
          },
        ],
        'tool_calls',
      ),
    ];

    const result = await streamOneRound(
      toAsyncIterable(chunks) as AsyncIterable<Chunk>,
      {
        stream,
        conversationId: 'test-conv',
        existingChars: 0,
      },
    );

    expect(result.toolAccumulators.size).toBe(2);
    expect(getAcc(result.toolAccumulators, 0).name).toBe('express_confusion');
    expect(getAcc(result.toolAccumulators, 1).name).toBe('ask_question');
  });

  test('interleaves text and tool calls', async () => {
    const stream = createMockSSEStream();
    const chunks = [
      textChunk("I'm confused about "),
      textChunk('evolution.'),
      toolCallChunk(
        [
          {
            index: 0,
            id: 'call_1',
            name: 'express_confusion',
            arguments: '{"topic":"evolution"}',
          },
        ],
        'tool_calls',
      ),
    ];

    const result = await streamOneRound(
      toAsyncIterable(chunks) as AsyncIterable<Chunk>,
      {
        stream,
        conversationId: 'test-conv',
        existingChars: 0,
      },
    );

    expect(result.chunks).toEqual(["I'm confused about ", 'evolution.']);
    expect(result.toolAccumulators.size).toBe(1);
    expect(result.finishReason).toBe('tool_calls');
  });

  test('normalizes max_tokens finish reason to length', async () => {
    const stream = createMockSSEStream();
    const chunks = [textChunk('truncated', 'max_tokens')];

    const result = await streamOneRound(
      toAsyncIterable(chunks) as AsyncIterable<Chunk>,
      {
        stream,
        conversationId: 'test-conv',
        existingChars: 0,
      },
    );

    expect(result.finishReason).toBe('length');
  });

  test('aborts on MAX_RESPONSE_CHARS exceeded', async () => {
    const stream = createMockSSEStream();
    const abortController = new AbortController();
    // Generate a huge text chunk
    const bigText = 'x'.repeat(600 * 1024);
    const chunks = [textChunk(bigText)];

    const result = await streamOneRound(
      toAsyncIterable(chunks) as AsyncIterable<Chunk>,
      {
        stream,
        abortController,
        conversationId: 'test-conv',
        existingChars: 0,
      },
    );

    expect(result.finishReason).toBe('length');
    expect(abortController.signal.aborted).toBe(true);
  });

  test('returns aborted when stream is aborted', async () => {
    const stream = createMockSSEStream(true);
    const chunks = [textChunk('should not process')];

    const result = await streamOneRound(
      toAsyncIterable(chunks) as AsyncIterable<Chunk>,
      {
        stream,
        conversationId: 'test-conv',
        existingChars: 0,
      },
    );

    expect(result.aborted).toBe(true);
    expect(result.chunks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// emitToolCalls tests
// ---------------------------------------------------------------------------

describe('emitToolCalls', () => {
  test('parses and emits valid tool calls', async () => {
    const stream = createMockSSEStream();
    const accumulators = new Map<number, ToolCallAccumulator>([
      [
        0,
        {
          id: 'call_1',
          name: 'express_confusion',
          arguments: '{"topic":"DNA"}',
        },
      ],
      [
        1,
        {
          id: 'call_2',
          name: 'ask_question',
          arguments: '{"question":"why?"}',
        },
      ],
    ]);

    const parsed = await emitToolCalls(accumulators, stream);

    expect(parsed.length).toBe(2);
    expect(parsed[0]).toEqual({
      name: 'express_confusion',
      arguments: { topic: 'DNA' },
    });
    expect(parsed[1]).toEqual({
      name: 'ask_question',
      arguments: { question: 'why?' },
    });

    // Two SSE events emitted
    expect(stream.events.length).toBe(2);
    const evt0 = JSON.parse(stream.events[0].data);
    expect(evt0.type).toBe('tool_call');
    expect(evt0.name).toBe('express_confusion');
  });

  test('skips accumulators with no name', async () => {
    const stream = createMockSSEStream();
    const accumulators = new Map<number, ToolCallAccumulator>([
      [0, { id: 'call_1', name: '', arguments: '{}' }],
      [1, { id: 'call_2', name: 'ask_question', arguments: '{"q":"test"}' }],
    ]);

    const parsed = await emitToolCalls(accumulators, stream);

    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe('ask_question');
    expect(stream.events.length).toBe(1);
  });

  test('skips tool calls with malformed JSON arguments', async () => {
    const stream = createMockSSEStream();
    const accumulators = new Map<number, ToolCallAccumulator>([
      [
        0,
        { id: 'call_1', name: 'express_confusion', arguments: '{broken json' },
      ],
      [1, { id: 'call_2', name: 'ask_question', arguments: '{"q":"ok"}' }],
    ]);

    const parsed = await emitToolCalls(accumulators, stream);

    // Malformed one is skipped, valid one is emitted
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe('ask_question');
    expect(stream.events.length).toBe(1);
  });

  test('returns empty array for empty accumulators', async () => {
    const stream = createMockSSEStream();
    const accumulators = new Map<number, ToolCallAccumulator>();

    const parsed = await emitToolCalls(accumulators, stream);

    expect(parsed).toEqual([]);
    expect(stream.events.length).toBe(0);
  });
});
