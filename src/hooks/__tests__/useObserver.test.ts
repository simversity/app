import { describe, expect, test } from 'bun:test';
import {
  type ChatMessage,
  initialState,
  mapApiMessages,
  streamingReducer,
} from '../useStreamingChat';

/**
 * Unit tests for useObserver logic patterns.
 * Tests the observer-specific flows: loading messages, error handling,
 * and endpoint construction. The shared streaming reducer is tested
 * separately in useStreamingChat.test.ts — here we test observer-specific
 * dispatch sequences.
 */

describe('useObserver dispatch sequences', () => {
  test('loadMessages dispatches INIT with empty messages array', () => {
    const state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: [],
    });
    expect(state.conversationId).toBe('conv-1');
    expect(state.messages).toEqual([]);
    expect(state.initialized).toBe(true);
    expect(state.status).toBe('idle');
  });

  test('loadMessages dispatches INIT with fetched messages', () => {
    const messages: ChatMessage[] = [
      {
        id: 'obs-1',
        role: 'user',
        content: 'How am I doing?',
        isStreaming: false,
      },
      {
        id: 'obs-2',
        role: 'assistant',
        content: 'Great use of probing questions.',
        isStreaming: false,
      },
    ];
    const state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages,
    });
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].content).toBe('How am I doing?');
    expect(state.messages[1].content).toBe('Great use of probing questions.');
  });

  test('loadMessages ERROR dispatch on fetch failure', () => {
    // Simulate: INIT (reset) → ERROR
    let state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: [],
    });
    state = streamingReducer(state, {
      type: 'ERROR',
      message:
        'Unable to connect. Please check your internet connection and try again.',
    });
    expect(state.status).toBe('error');
    expect(state.error).toContain('Unable to connect');
    expect(state.conversationId).toBe('conv-1');
  });

  test('sendMessage flow: user message → stream start → chunks → end', () => {
    // Start with an initialized observer
    let state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: [],
    });

    // User asks a question
    state = streamingReducer(state, {
      type: 'ADD_USER_MESSAGE',
      id: 'user-q',
      content: 'What patterns do you notice?',
    });
    expect(state.messages).toHaveLength(1);
    expect(state.status).toBe('streaming');

    // Observer starts responding
    state = streamingReducer(state, {
      type: 'STREAM_START',
      id: 'obs-resp',
    });
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].role).toBe('assistant');
    expect(state.messages[1].isStreaming).toBe(true);

    // Streaming chunks arrive
    state = streamingReducer(state, {
      type: 'STREAM_CHUNK',
      id: 'obs-resp',
      text: 'I noticed you used ',
    });
    state = streamingReducer(state, {
      type: 'STREAM_CHUNK',
      id: 'obs-resp',
      text: 'effective questioning.',
    });
    expect(state.messages[1].content).toBe(
      'I noticed you used effective questioning.',
    );

    // Stream completes
    state = streamingReducer(state, {
      type: 'STREAM_END',
      id: 'obs-resp',
    });
    expect(state.messages[1].isStreaming).toBe(false);
    expect(state.status).toBe('idle');
  });

  test('re-loading messages replaces existing ones', () => {
    const initial: ChatMessage[] = [
      { id: 'old-1', role: 'user', content: 'Old message', isStreaming: false },
    ];
    let state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: initial,
    });
    expect(state.messages).toHaveLength(1);

    // Re-initialize with new data (simulates loadMessages called again)
    const updated: ChatMessage[] = [
      { id: 'old-1', role: 'user', content: 'Old message', isStreaming: false },
      {
        id: 'new-2',
        role: 'assistant',
        content: 'New response',
        isStreaming: false,
      },
    ];
    state = streamingReducer(state, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: updated,
    });
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].content).toBe('New response');
  });

  test('error during streaming preserves existing messages', () => {
    let state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: [
        {
          id: 'obs-1',
          role: 'assistant',
          content: 'Earlier feedback',
          isStreaming: false,
        },
      ],
    });

    state = streamingReducer(state, {
      type: 'ADD_USER_MESSAGE',
      id: 'user-2',
      content: 'Follow up question',
    });

    state = streamingReducer(state, {
      type: 'ERROR',
      message: 'The observer is having trouble responding. Please try again.',
    });

    expect(state.status).toBe('error');
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].content).toBe('Earlier feedback');
  });
});

describe('mapApiMessages for observer', () => {
  test('maps observer messages correctly', () => {
    const raw = [
      { id: 'obs-1', role: 'user', content: 'How am I doing?' },
      {
        id: 'obs-2',
        role: 'assistant',
        content: 'Good questioning technique.',
      },
    ];
    const mapped = mapApiMessages(raw);
    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toEqual({
      id: 'obs-1',
      role: 'user',
      content: 'How am I doing?',
      isStreaming: false,
      agentId: undefined,
      agentName: undefined,
    });
    expect(mapped[1].role).toBe('assistant');
    expect(mapped[1].isStreaming).toBe(false);
  });

  test('handles empty message array', () => {
    const mapped = mapApiMessages([]);
    expect(mapped).toEqual([]);
  });
});
