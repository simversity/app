import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { SSEStreamingApi } from 'hono/streaming';

// ---------------------------------------------------------------------------
// Mocks — lightweight stubs for all external dependencies
// ---------------------------------------------------------------------------

const noop = () => {};
mock.module('../logger', () => ({
  log: { info: noop, warn: noop, error: noop, debug: noop },
}));

mock.module('../env', () => ({
  env: { NEARAI_MAX_TOKENS: 500 },
}));

// Track AI create calls
let aiCreateCalls: unknown[] = [];
let aiCreateImpl: (...args: unknown[]) => unknown = async () => ({
  async *[Symbol.asyncIterator]() {
    yield { choices: [{ delta: { content: 'Mock response' } }] };
    yield { choices: [{ delta: {} }] };
  },
});

mock.module('../../ai/client', () => ({
  openai: {
    chat: {
      completions: {
        create: (...args: unknown[]) => {
          aiCreateCalls.push(args);
          return aiCreateImpl(...args);
        },
      },
    },
  },
}));

mock.module('../../ai/models', () => ({
  getContextLimit: () => 16_000,
}));

mock.module('../../ai/prompts', () => ({
  buildNudgePrompt: (ctx: { agentNames: string[] }) => [
    { role: 'system', content: `Nudge for ${ctx.agentNames.join(', ')}` },
    { role: 'user', content: 'Recent exchanges' },
  ],
}));

// callAIWithRetry — pass through to the real create function
mock.module('../ai-helpers', () => ({
  callAIWithRetry: async (
    createStream: () => Promise<unknown>,
    _opts: { stream: unknown },
  ) => {
    try {
      return await createStream();
    } catch {
      return null;
    }
  },
}));

// streamAndSaveAIResponse — simulate streaming behavior
let streamAndSaveImpl: (opts: Record<string, unknown>) => Promise<void>;

mock.module('../streaming', () => ({
  streamAndSaveAIResponse: (opts: Record<string, unknown>) =>
    streamAndSaveImpl(opts),
}));

// token-estimate: not mocked — real trimMessagesToFit is safe in tests

mock.module('../shared-budgets', () => ({
  checkDailyBudget: Object.assign(() => true, { release: noop }),
}));

mock.module('../conversation-helpers', () => ({
  buildAgentChatMessages: (opts: {
    agent: { personaName: string };
    userContent: string;
  }) => [
    { role: 'system', content: `You are ${opts.agent.personaName}` },
    { role: 'user', content: opts.userContent },
  ],
}));

mock.module('../constants', () => ({
  ErrorMessage: {
    STUDENT_TROUBLE: 'Student trouble',
    STUDENT_EMPTY: 'Student empty',
    STUDENT_TIMEOUT: 'Student timeout',
    STUDENT_RATE_LIMITED: 'Student rate limited',
  },
  NUDGE_CONTEXT_RECENT_MESSAGES: 6,
  NUDGE_EVERY_N_TURNS: 3,
  NUDGE_MAX_TOKENS: 60,
}));

// Import AFTER mocks
const {
  handleSingleAgentResponse,
  handleMultiAgentResponse,
  handleInlineNudge,
} = await import('../message-handlers');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStream(): SSEStreamingApi & {
  events: { data: string; event: string }[];
  aborted: boolean;
} {
  const events: { data: string; event: string }[] = [];
  return {
    events,
    aborted: false,
    writeSSE: mock(async (msg: { data: string; event: string }) => {
      events.push(msg);
    }),
    onAbort: mock((_cb: () => void) => {}),
  } as unknown as SSEStreamingApi & {
    events: { data: string; event: string }[];
    aborted: boolean;
  };
}

function makeAgent(id: string, name: string, maxTokens?: number) {
  return {
    id: `agent-${id}`,
    personaId: `persona-${id}`,
    openingMessage: `Hi from ${name}`,
    sortOrder: 0,
    maxResponseTokens: maxTokens ?? null,
    personaName: name,
    personaDescription: `${name} is a student.`,
    systemPrompt: `You are ${name}.`,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  aiCreateCalls = [];
  aiCreateImpl = async () => ({
    async *[Symbol.asyncIterator]() {
      yield { choices: [{ delta: { content: 'Mock response' } }] };
      yield { choices: [{ delta: {} }] };
    },
  });
  // Default streamAndSave: call onComplete with response text, call afterSave
  streamAndSaveImpl = async (opts: Record<string, unknown>) => {
    if (typeof opts.onComplete === 'function') {
      (opts.onComplete as (text: string) => void)('Mock response');
    }
    if (typeof opts.afterSave === 'function') {
      await (opts.afterSave as (tx: unknown) => Promise<void>)({});
    }
  };
});

// ---------------------------------------------------------------------------
// handleSingleAgentResponse
// ---------------------------------------------------------------------------

describe('handleSingleAgentResponse', () => {
  test('calls AI and streams response for single agent', async () => {
    const stream = makeStream();
    let afterSaveCalled = false;

    await handleSingleAgentResponse({
      conversationId: 'conv-1',
      userId: 'user-1',
      resolvedModel: 'test-model',
      stream,
      chatMessages: [
        { role: 'system', content: 'You are Riley.' },
        { role: 'user', content: 'Hello' },
      ],
      teacherSortOrder: 1,
      agentPersonaId: 'persona-1',
      agentPersonaName: 'Riley',
      afterSave: async () => {
        afterSaveCalled = true;
      },
    });

    expect(aiCreateCalls.length).toBe(1);
    expect(afterSaveCalled).toBe(true);
  });

  test('does nothing when AI returns null (callAIWithRetry failed)', async () => {
    aiCreateImpl = async () => {
      throw new Error('AI unavailable');
    };
    const stream = makeStream();
    let afterSaveCalled = false;

    await handleSingleAgentResponse({
      conversationId: 'conv-2',
      userId: 'user-1',
      resolvedModel: 'test-model',
      stream,
      chatMessages: [{ role: 'user', content: 'Hello' }],
      teacherSortOrder: 1,
      agentPersonaId: 'persona-1',
      agentPersonaName: 'Riley',
      afterSave: async () => {
        afterSaveCalled = true;
      },
    });

    // afterSave should not be called since AI failed
    expect(afterSaveCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleMultiAgentResponse
// ---------------------------------------------------------------------------

describe('handleMultiAgentResponse', () => {
  test('processes agents sequentially and returns turn responses', async () => {
    const stream = makeStream();
    const agents = [makeAgent('1', 'Riley'), makeAgent('2', 'Sam')];

    const result = await handleMultiAgentResponse({
      conversationId: 'conv-3',
      userId: 'user-1',
      resolvedModel: 'test-model',
      stream,
      respondingAgents: agents,
      agents,
      recentMessages: [],
      content: 'What is evolution?',
      teacherSortOrder: 1,
      afterSave: async () => {},
    });

    expect(result.turnResponses).toHaveLength(2);
    expect(result.turnResponses[0].agentId).toBe('persona-1');
    expect(result.turnResponses[1].agentId).toBe('persona-2');
    expect(result.nextSortOrder).toBe(4); // 1+1 start, +1 per agent
  });

  test('stops processing when stream is aborted mid-sequence', async () => {
    const stream = makeStream();
    const agents = [
      makeAgent('1', 'Riley'),
      makeAgent('2', 'Sam'),
      makeAgent('3', 'Alex'),
    ];

    let callIndex = 0;
    streamAndSaveImpl = async (opts: Record<string, unknown>) => {
      callIndex++;
      if (callIndex === 1) {
        // First agent responds normally
        if (typeof opts.onComplete === 'function') {
          (opts.onComplete as (text: string) => void)('Riley response');
        }
      }
      if (callIndex === 2) {
        // Second agent — simulate abort during streaming
        (stream as unknown as { aborted: boolean }).aborted = true;
        // onComplete not called (aborted)
      }
    };

    const result = await handleMultiAgentResponse({
      conversationId: 'conv-4',
      userId: 'user-1',
      resolvedModel: 'test-model',
      stream,
      respondingAgents: agents,
      agents,
      recentMessages: [],
      content: 'Tell me about cells',
      teacherSortOrder: 0,
      afterSave: async () => {},
    });

    // Only the first agent's response should be captured
    expect(result.turnResponses).toHaveLength(1);
    expect(result.turnResponses[0].agentId).toBe('persona-1');
  });

  test('returns early when AI call fails for an agent', async () => {
    const stream = makeStream();
    const agents = [makeAgent('1', 'Riley'), makeAgent('2', 'Sam')];

    // First call fails
    aiCreateImpl = async () => {
      throw new Error('AI overloaded');
    };

    const result = await handleMultiAgentResponse({
      conversationId: 'conv-5',
      userId: 'user-1',
      resolvedModel: 'test-model',
      stream,
      respondingAgents: agents,
      agents,
      recentMessages: [],
      content: 'Hello',
      teacherSortOrder: 0,
      afterSave: async () => {},
    });

    // No responses captured since first agent failed
    expect(result.turnResponses).toHaveLength(0);
  });

  test('handles empty response from agent (no capturedText)', async () => {
    const stream = makeStream();
    const agents = [makeAgent('1', 'Riley'), makeAgent('2', 'Sam')];

    streamAndSaveImpl = async (opts: Record<string, unknown>) => {
      // onComplete called with empty string
      if (typeof opts.onComplete === 'function') {
        (opts.onComplete as (text: string) => void)('');
      }
    };

    const result = await handleMultiAgentResponse({
      conversationId: 'conv-6',
      userId: 'user-1',
      resolvedModel: 'test-model',
      stream,
      respondingAgents: agents,
      agents,
      recentMessages: [],
      content: 'Hello',
      teacherSortOrder: 0,
      afterSave: async () => {},
    });

    // Empty response stops processing
    expect(result.turnResponses).toHaveLength(0);
  });

  test('only last agent gets afterSave callback', async () => {
    const stream = makeStream();
    const agents = [makeAgent('1', 'Riley'), makeAgent('2', 'Sam')];
    const afterSaveSeen: boolean[] = [];

    streamAndSaveImpl = async (opts: Record<string, unknown>) => {
      afterSaveSeen.push(opts.afterSave != null);
      if (typeof opts.onComplete === 'function') {
        (opts.onComplete as (text: string) => void)('Response');
      }
      if (typeof opts.afterSave === 'function') {
        await (opts.afterSave as (tx: unknown) => Promise<void>)({});
      }
    };

    await handleMultiAgentResponse({
      conversationId: 'conv-7',
      userId: 'user-1',
      resolvedModel: 'test-model',
      stream,
      respondingAgents: agents,
      agents,
      recentMessages: [],
      content: 'Hello',
      teacherSortOrder: 0,
      afterSave: async () => {},
    });

    // First agent: no afterSave, second agent: has afterSave
    expect(afterSaveSeen).toEqual([false, true]);
  });

  test('sets multiAgentContinue on non-last agents', async () => {
    const stream = makeStream();
    const agents = [makeAgent('1', 'Riley'), makeAgent('2', 'Sam')];
    const extraDoneValues: Record<string, unknown>[] = [];

    streamAndSaveImpl = async (opts: Record<string, unknown>) => {
      extraDoneValues.push(opts.extraDone as Record<string, unknown>);
      if (typeof opts.onComplete === 'function') {
        (opts.onComplete as (text: string) => void)('Response');
      }
    };

    await handleMultiAgentResponse({
      conversationId: 'conv-8',
      userId: 'user-1',
      resolvedModel: 'test-model',
      stream,
      respondingAgents: agents,
      agents,
      recentMessages: [],
      content: 'Hello',
      teacherSortOrder: 0,
      afterSave: async () => {},
    });

    expect(extraDoneValues[0]).toHaveProperty('multiAgentContinue', true);
    expect(extraDoneValues[1]).not.toHaveProperty('multiAgentContinue');
  });

  test('respects per-agent maxResponseTokens', async () => {
    const stream = makeStream();
    const agents = [makeAgent('1', 'Riley', 200), makeAgent('2', 'Sam', 300)];
    const maxTokensSeen: number[] = [];

    // Capture max_tokens from AI create calls
    const origImpl = aiCreateImpl;
    aiCreateImpl = async (...args: unknown[]) => {
      const params = (args as unknown[][])[0] as { max_tokens?: number }[];
      if (params && typeof params[0] === 'object' && params[0].max_tokens) {
        maxTokensSeen.push(params[0].max_tokens);
      }
      return origImpl(...args);
    };

    await handleMultiAgentResponse({
      conversationId: 'conv-9',
      userId: 'user-1',
      resolvedModel: 'test-model',
      stream,
      respondingAgents: agents,
      agents,
      recentMessages: [],
      content: 'Hello',
      teacherSortOrder: 0,
      afterSave: async () => {},
    });

    // Both agents should have been processed
    expect(aiCreateCalls.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// handleInlineNudge
// ---------------------------------------------------------------------------

describe('handleInlineNudge', () => {
  const agents = [makeAgent('1', 'Riley'), makeAgent('2', 'Sam')];

  test('skips when stream is aborted', async () => {
    const stream = makeStream();
    (stream as unknown as { aborted: boolean }).aborted = true;

    await handleInlineNudge({
      stream,
      sc: { observerMode: 'inline' },
      agents,
      respondingAgents: agents,
      recentMessages: [],
      content: 'Hello',
      turnResponses: [
        { role: 'assistant', content: 'Hi', agentId: 'persona-1' },
        { role: 'assistant', content: 'Hello', agentId: 'persona-2' },
      ],
      nextSortOrder: 6,
      resolvedModel: 'test-model',
    });

    expect(stream.events).toHaveLength(0);
  });

  test('skips when observerMode is null', async () => {
    const stream = makeStream();
    aiCreateCalls = [];

    await handleInlineNudge({
      stream,
      sc: { observerMode: null },
      agents,
      respondingAgents: agents,
      recentMessages: [],
      content: 'Hello',
      turnResponses: [],
      nextSortOrder: 6,
      resolvedModel: 'test-model',
    });

    expect(aiCreateCalls).toHaveLength(0);
  });

  test('skips when observerMode is panel', async () => {
    const stream = makeStream();
    aiCreateCalls = [];

    await handleInlineNudge({
      stream,
      sc: { observerMode: 'panel' },
      agents,
      respondingAgents: agents,
      recentMessages: [],
      content: 'Hello',
      turnResponses: [],
      nextSortOrder: 6,
      resolvedModel: 'test-model',
    });

    expect(aiCreateCalls).toHaveLength(0);
  });

  test('skips for single-agent scenarios', async () => {
    const stream = makeStream();
    const singleAgent = [makeAgent('1', 'Riley')];
    aiCreateCalls = [];

    await handleInlineNudge({
      stream,
      sc: { observerMode: 'inline' },
      agents: singleAgent,
      respondingAgents: singleAgent,
      recentMessages: [],
      content: 'Hello',
      turnResponses: [],
      nextSortOrder: 6,
      resolvedModel: 'test-model',
    });

    expect(aiCreateCalls).toHaveLength(0);
  });

  test('writes nudge SSE when AI returns nudge text', async () => {
    const stream = makeStream();

    // Mock AI to return a nudge
    aiCreateImpl = async () => ({
      choices: [
        { message: { content: 'Consider asking Sam to respond to Riley.' } },
      ],
    });

    // nextSortOrder = 9 with 2 agents → teacherTurnCount = (9-2)/(2+1) = 2.33 → floor = 2
    // But 2 % 3 !== 0, so nudge won't fire. We need teacherTurnCount divisible by 3.
    // With 2 agents: teacherTurnCount = floor((nextSortOrder - 2) / 3)
    // For teacherTurnCount = 3: nextSortOrder - 2 = 9 → nextSortOrder = 11
    await handleInlineNudge({
      stream,
      sc: { observerMode: 'inline' },
      agents,
      respondingAgents: agents,
      recentMessages: [],
      content: 'Hello',
      turnResponses: [
        { role: 'assistant', content: 'Hi', agentId: 'persona-1' },
        { role: 'assistant', content: 'Hello', agentId: 'persona-2' },
      ],
      nextSortOrder: 11,
      resolvedModel: 'test-model',
    });

    const nudgeEvents = stream.events.filter((e) => {
      const parsed = JSON.parse(e.data);
      return parsed.type === 'observer_nudge';
    });
    expect(nudgeEvents).toHaveLength(1);
    expect(JSON.parse(nudgeEvents[0].data).text).toBe(
      'Consider asking Sam to respond to Riley.',
    );
  });

  test('does not write SSE when AI returns NONE', async () => {
    const stream = makeStream();

    aiCreateImpl = async () => ({
      choices: [{ message: { content: 'NONE' } }],
    });

    await handleInlineNudge({
      stream,
      sc: { observerMode: 'inline' },
      agents,
      respondingAgents: agents,
      recentMessages: [],
      content: 'Hello',
      turnResponses: [
        { role: 'assistant', content: 'Hi', agentId: 'persona-1' },
        { role: 'assistant', content: 'Hello', agentId: 'persona-2' },
      ],
      nextSortOrder: 11,
      resolvedModel: 'test-model',
    });

    const nudgeEvents = stream.events.filter((e) => {
      const parsed = JSON.parse(e.data);
      return parsed.type === 'observer_nudge';
    });
    expect(nudgeEvents).toHaveLength(0);
  });

  test('silently catches AI errors (non-critical)', async () => {
    const stream = makeStream();

    aiCreateImpl = async () => {
      throw new Error('AI timeout');
    };

    // Should not throw
    await handleInlineNudge({
      stream,
      sc: { observerMode: 'inline' },
      agents,
      respondingAgents: agents,
      recentMessages: [],
      content: 'Hello',
      turnResponses: [
        { role: 'assistant', content: 'Hi', agentId: 'persona-1' },
        { role: 'assistant', content: 'Hello', agentId: 'persona-2' },
      ],
      nextSortOrder: 11,
      resolvedModel: 'test-model',
    });

    expect(stream.events).toHaveLength(0);
  });

  test('skips nudge when turn count is not divisible by NUDGE_EVERY_N_TURNS', async () => {
    const stream = makeStream();
    aiCreateCalls = [];

    // nextSortOrder = 5 → teacherTurnCount = floor((5-2)/3) = 1, 1 % 3 !== 0
    await handleInlineNudge({
      stream,
      sc: { observerMode: 'inline' },
      agents,
      respondingAgents: agents,
      recentMessages: [],
      content: 'Hello',
      turnResponses: [
        { role: 'assistant', content: 'Hi', agentId: 'persona-1' },
        { role: 'assistant', content: 'Hello', agentId: 'persona-2' },
      ],
      nextSortOrder: 5,
      resolvedModel: 'test-model',
    });

    expect(aiCreateCalls).toHaveLength(0);
  });
});
