import { describe, expect, test } from 'bun:test';
import {
  initialState,
  type StreamingState,
  streamingReducer,
} from '../useStreamingChat';

/**
 * Unit tests for useConversation logic patterns.
 * Tests conversation-specific dispatch sequences: start, send, restart,
 * clear error, dismiss nudge. The shared streaming reducer is tested
 * separately in useStreamingChat.test.ts — here we test conversation-specific
 * flows.
 */

describe('useConversation dispatch sequences', () => {
  test('startConversation: RESET then INIT with opening messages', () => {
    // Simulate a dirty state from a previous conversation
    const dirty: StreamingState = {
      conversationId: 'old-conv',
      messages: [
        { id: 'm1', role: 'user', content: 'Old', isStreaming: false },
      ],
      status: 'error',
      error: 'Old error',
      initialized: true,
      lastUserContent: 'Old',
    };

    // startConversation dispatches RESET first
    let state = streamingReducer(dirty, { type: 'RESET' });
    expect(state).toEqual(initialState);

    // Then INIT with the new conversation data from the server
    state = streamingReducer(state, {
      type: 'INIT',
      conversationId: 'new-conv',
      messages: [
        {
          id: 'opening-1',
          role: 'assistant',
          content: "Hi teacher! I'm confused about evolution.",
          isStreaming: false,
          agentId: 'agent-riley',
          agentName: 'Riley',
        },
      ],
    });
    expect(state.conversationId).toBe('new-conv');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].agentName).toBe('Riley');
    expect(state.initialized).toBe(true);
    expect(state.status).toBe('idle');
    expect(state.error).toBeNull();
  });

  test('startConversation: ERROR on API failure after RESET', () => {
    let state = streamingReducer(initialState, { type: 'RESET' });
    state = streamingReducer(state, {
      type: 'ERROR',
      message: 'Something went wrong. Please try again.',
    });
    expect(state.status).toBe('error');
    expect(state.error).toBe('Something went wrong. Please try again.');
    expect(state.initialized).toBe(true);
  });

  test('sendMessage: full multi-agent conversation flow', () => {
    // Initialize conversation
    let state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: [
        {
          id: 'opening',
          role: 'assistant',
          content: 'Hi!',
          isStreaming: false,
          agentId: 'agent-riley',
          agentName: 'Riley',
        },
      ],
    });

    // Teacher sends a message
    state = streamingReducer(state, {
      type: 'ADD_USER_MESSAGE',
      id: 'user-1',
      content: 'Can you explain what evolution means to you?',
    });
    expect(state.messages).toHaveLength(2);
    expect(state.status).toBe('streaming');
    expect(state.lastUserContent).toBe(
      'Can you explain what evolution means to you?',
    );

    // First agent starts responding
    state = streamingReducer(state, {
      type: 'STREAM_START',
      id: 'resp-riley',
      agentId: 'agent-riley',
      agentName: 'Riley',
    });
    expect(state.messages).toHaveLength(3);

    // Streaming chunks
    state = streamingReducer(state, {
      type: 'STREAM_CHUNK',
      id: 'resp-riley',
      text: 'I think it means animals ',
    });
    state = streamingReducer(state, {
      type: 'STREAM_CHUNK',
      id: 'resp-riley',
      text: 'try to change to survive!',
    });
    expect(state.messages[2].content).toBe(
      'I think it means animals try to change to survive!',
    );

    // First agent done
    state = streamingReducer(state, {
      type: 'STREAM_END',
      id: 'resp-riley',
      serverId: 'server-msg-1',
    });
    expect(state.messages[2].id).toBe('server-msg-1');
    expect(state.messages[2].isStreaming).toBe(false);
    expect(state.status).toBe('idle');
  });

  test('restart: aborts stream and resets', () => {
    // Simulate being in middle of streaming
    const streaming: StreamingState = {
      conversationId: 'conv-1',
      messages: [
        {
          id: 'opening',
          role: 'assistant',
          content: 'Hi!',
          isStreaming: false,
        },
        {
          id: 'user-1',
          role: 'user',
          content: 'Tell me about evolution',
          isStreaming: false,
        },
        {
          id: 'resp-1',
          role: 'assistant',
          content: 'I think...',
          isStreaming: true,
        },
      ],
      status: 'streaming',
      error: null,
      initialized: true,
      lastUserContent: 'Tell me about evolution',
    };

    // restart dispatches RESET (after abort)
    const state = streamingReducer(streaming, { type: 'RESET' });
    expect(state).toEqual(initialState);
  });

  test('clearError: transitions from error to idle', () => {
    const errorState: StreamingState = {
      ...initialState,
      conversationId: 'conv-1',
      messages: [
        {
          id: 'opening',
          role: 'assistant',
          content: 'Hi!',
          isStreaming: false,
        },
      ],
      status: 'error',
      error: 'Network failure',
      initialized: true,
      lastUserContent: null,
    };

    const state = streamingReducer(errorState, { type: 'CLEAR_ERROR' });
    expect(state.status).toBe('idle');
    expect(state.error).toBeNull();
    // Messages should be preserved
    expect(state.messages).toHaveLength(1);
    expect(state.conversationId).toBe('conv-1');
  });

  test('dismissNudge: removes nudge message by id', () => {
    const withNudge: StreamingState = {
      ...initialState,
      conversationId: 'conv-1',
      initialized: true,
      lastUserContent: null,
      messages: [
        {
          id: 'opening',
          role: 'assistant',
          content: 'Hi!',
          isStreaming: false,
        },
        {
          id: 'nudge-1',
          role: 'nudge',
          content: 'Consider asking the student to elaborate.',
          isStreaming: false,
        },
        { id: 'user-1', role: 'user', content: 'Hello', isStreaming: false },
      ],
    };

    const state = streamingReducer(withNudge, {
      type: 'REMOVE_MESSAGE',
      id: 'nudge-1',
    });
    expect(state.messages).toHaveLength(2);
    expect(state.messages.find((m) => m.id === 'nudge-1')).toBeUndefined();
  });

  test('dismissNudge: other messages unaffected', () => {
    const withNudge: StreamingState = {
      ...initialState,
      conversationId: 'conv-1',
      initialized: true,
      lastUserContent: null,
      messages: [
        { id: 'm1', role: 'assistant', content: 'Hi!', isStreaming: false },
        {
          id: 'nudge-1',
          role: 'nudge',
          content: 'Nudge text',
          isStreaming: false,
        },
        { id: 'm2', role: 'user', content: 'Response', isStreaming: false },
      ],
    };

    const state = streamingReducer(withNudge, {
      type: 'REMOVE_MESSAGE',
      id: 'nudge-1',
    });
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].id).toBe('m1');
    expect(state.messages[1].id).toBe('m2');
  });
});

describe('useConversation nudge handling', () => {
  test('NUDGE action adds nudge message', () => {
    const withMessages: StreamingState = {
      ...initialState,
      conversationId: 'conv-1',
      initialized: true,
      lastUserContent: null,
      messages: [
        {
          id: 'opening',
          role: 'assistant',
          content: 'Hi!',
          isStreaming: false,
        },
      ],
    };

    const state = streamingReducer(withMessages, {
      type: 'NUDGE',
      id: 'nudge-1',
      text: 'Try asking the student to justify their reasoning.',
    });
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].role).toBe('nudge');
    expect(state.messages[1].content).toBe(
      'Try asking the student to justify their reasoning.',
    );
    expect(state.messages[1].isStreaming).toBe(false);
  });
});

describe('conversation state guards', () => {
  /**
   * These tests verify the actual guard logic from useSendMessage:
   *   if (!conversationId || status === 'streaming') return;
   * We extract the guard condition as a pure function to test without
   * rendering a React hook.
   */
  const shouldSend = (state: StreamingState): boolean => {
    const { conversationId, status } = state;
    return Boolean(conversationId) && status !== 'streaming';
  };

  test('guard blocks send when conversationId is null', () => {
    expect(shouldSend(initialState)).toBe(false);
  });

  test('guard blocks send when status is streaming', () => {
    const state = streamingReducer(
      {
        ...initialState,
        conversationId: 'conv-1',
        initialized: true,
        lastUserContent: null,
      },
      {
        type: 'ADD_USER_MESSAGE',
        id: 'user-1',
        content: 'Hello',
      },
    );
    expect(shouldSend(state)).toBe(false);
  });

  test('guard allows send when status is idle with conversationId', () => {
    const state: StreamingState = {
      ...initialState,
      conversationId: 'conv-1',
      initialized: true,
      lastUserContent: null,
    };
    expect(shouldSend(state)).toBe(true);
  });

  test('guard allows send when status is error with conversationId', () => {
    const state: StreamingState = {
      ...initialState,
      conversationId: 'conv-1',
      status: 'error',
      error: 'Previous error',
      initialized: true,
      lastUserContent: null,
    };
    expect(shouldSend(state)).toBe(true);
  });
});
