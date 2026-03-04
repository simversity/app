import { describe, expect, mock, test } from 'bun:test';

// Mock logger
mock.module('../logger', () => ({
  log: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

import { callAIWithRetry } from '../ai-helpers';

function makeMockStream() {
  const written: unknown[] = [];
  return {
    stream: {
      writeSSE: mock(async (data: unknown) => {
        written.push(data);
      }),
    } as unknown as Parameters<typeof callAIWithRetry>[1]['stream'],
    written,
  };
}

const baseOpts = {
  errorMessage: 'AI error',
  logContext: { conversationId: 'test' },
  logLabel: 'test-call',
};

describe('callAIWithRetry', () => {
  test('returns stream on success', async () => {
    const { stream } = makeMockStream();
    const mockIterable = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'hi' } }] };
      },
    };
    const createStream = mock(() =>
      Promise.resolve(mockIterable),
    ) as unknown as Parameters<typeof callAIWithRetry>[0];
    const result = await callAIWithRetry(createStream, {
      ...baseOpts,
      stream,
    });
    expect(result).toBe(mockIterable as never);
  });

  test('returns null and writes error SSE on failure', async () => {
    const { stream, written } = makeMockStream();
    const createStream = mock(() => Promise.reject(new Error('fail')));
    const result = await callAIWithRetry(createStream, {
      ...baseOpts,
      stream,
    });
    expect(result).toBeNull();
    expect(written).toHaveLength(1);
    const data = JSON.parse((written[0] as { data: string }).data);
    expect(data.type).toBe('error');
    expect(data.message).toBe('AI error');
  });
});
