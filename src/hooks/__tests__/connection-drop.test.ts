import { describe, expect, test } from 'bun:test';
import {
  initialState,
  type StreamingState,
  streamingReducer,
} from '../useStreamingChat';

/**
 * Tests for connection-drop scenarios where STREAM_END never arrives.
 * Verifies that the reducer handles partial states gracefully and that
 * the application can recover from stuck streaming states.
 */

describe('connection drop — missing STREAM_END', () => {
  test('state stays streaming when STREAM_END never arrives', () => {
    let state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: [],
    });
    state = streamingReducer(state, {
      type: 'ADD_USER_MESSAGE',
      id: 'user-1',
      content: 'Hello',
    });
    state = streamingReducer(state, {
      type: 'STREAM_START',
      id: 'ai-1',
    });
    state = streamingReducer(state, {
      type: 'STREAM_CHUNK',
      id: 'ai-1',
      text: 'Partial response...',
    });

    // No STREAM_END — state remains streaming with partial content
    expect(state.status).toBe('streaming');
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].isStreaming).toBe(true);
    expect(state.messages[1].content).toBe('Partial response...');
  });

  test('ERROR action recovers from stuck streaming state', () => {
    let state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: [],
    });
    state = streamingReducer(state, {
      type: 'ADD_USER_MESSAGE',
      id: 'user-1',
      content: 'Hello',
    });
    state = streamingReducer(state, {
      type: 'STREAM_START',
      id: 'ai-1',
    });

    // Connection drops — timeout triggers ERROR
    state = streamingReducer(state, {
      type: 'ERROR',
      message: 'Connection lost. Please try again.',
    });
    expect(state.status).toBe('error');
    expect(state.error).toBe('Connection lost. Please try again.');
    // Messages preserved for user to see
    expect(state.messages).toHaveLength(2);
  });

  test('CLEAR_ERROR + new message after connection drop', () => {
    let state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: [],
    });
    state = streamingReducer(state, {
      type: 'ADD_USER_MESSAGE',
      id: 'user-1',
      content: 'Hello',
    });
    state = streamingReducer(state, {
      type: 'STREAM_START',
      id: 'ai-1',
    });
    state = streamingReducer(state, {
      type: 'ERROR',
      message: 'Connection lost.',
    });

    // User clears error and tries again
    state = streamingReducer(state, { type: 'CLEAR_ERROR' });
    expect(state.status).toBe('idle');
    expect(state.error).toBeNull();

    // Can send a new message
    state = streamingReducer(state, {
      type: 'ADD_USER_MESSAGE',
      id: 'user-2',
      content: 'Retry',
    });
    expect(state.status).toBe('streaming');
    expect(state.messages).toHaveLength(3);
  });

  test('REMOVE_MESSAGE cleans up orphaned streaming message', () => {
    let state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: [],
    });
    state = streamingReducer(state, {
      type: 'ADD_USER_MESSAGE',
      id: 'user-1',
      content: 'Hello',
    });
    state = streamingReducer(state, {
      type: 'STREAM_START',
      id: 'ai-1',
    });

    // Remove the orphaned streaming assistant message
    state = streamingReducer(state, {
      type: 'REMOVE_MESSAGE',
      id: 'ai-1',
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe('user');
  });

  test('RESET fully recovers from stuck streaming state', () => {
    let state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: [],
    });
    state = streamingReducer(state, {
      type: 'ADD_USER_MESSAGE',
      id: 'user-1',
      content: 'Hello',
    });
    state = streamingReducer(state, {
      type: 'STREAM_START',
      id: 'ai-1',
    });
    state = streamingReducer(state, {
      type: 'STREAM_CHUNK',
      id: 'ai-1',
      text: 'Partial...',
    });

    state = streamingReducer(state, { type: 'RESET' });
    expect(state).toEqual(initialState);
  });
});

describe('connection drop — multi-agent partial delivery', () => {
  test('first agent completes but second never starts', () => {
    let state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: [],
    });
    state = streamingReducer(state, {
      type: 'ADD_USER_MESSAGE',
      id: 'user-1',
      content: 'Riley and Sam, what do you think?',
    });

    // First agent streams and completes
    state = streamingReducer(state, {
      type: 'STREAM_START',
      id: 'ai-riley',
      agentId: 'agent-1',
      agentName: 'Riley',
    });
    state = streamingReducer(state, {
      type: 'STREAM_CHUNK',
      id: 'ai-riley',
      text: 'I think it means the strongest survive!',
    });
    state = streamingReducer(state, {
      type: 'STREAM_END',
      id: 'ai-riley',
      agentId: 'agent-1',
      agentName: 'Riley',
    });

    // Connection drops — Sam never starts
    // STREAM_END sets status back to idle
    expect(state.status).toBe('idle');
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].agentName).toBe('Riley');
    expect(state.messages[1].isStreaming).toBe(false);
  });

  test('second agent starts streaming but connection drops mid-chunk', () => {
    let state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: [],
    });
    state = streamingReducer(state, {
      type: 'ADD_USER_MESSAGE',
      id: 'user-1',
      content: 'What do you both think?',
    });

    // Riley completes
    state = streamingReducer(state, {
      type: 'STREAM_START',
      id: 'ai-riley',
      agentId: 'agent-1',
      agentName: 'Riley',
    });
    state = streamingReducer(state, {
      type: 'STREAM_CHUNK',
      id: 'ai-riley',
      text: 'Riley response.',
    });
    state = streamingReducer(state, {
      type: 'STREAM_END',
      id: 'ai-riley',
    });

    // Sam starts but connection drops after partial chunk
    state = streamingReducer(state, {
      type: 'STREAM_START',
      id: 'ai-sam',
      agentId: 'agent-2',
      agentName: 'Sam',
    });
    state = streamingReducer(state, {
      type: 'STREAM_CHUNK',
      id: 'ai-sam',
      text: 'Well, I was thinking',
    });

    // Connection drops — ERROR recovers
    state = streamingReducer(state, {
      type: 'ERROR',
      message: 'Stream interrupted.',
    });

    expect(state.status).toBe('error');
    expect(state.messages).toHaveLength(3);
    // Riley's complete message preserved
    expect(state.messages[1].content).toBe('Riley response.');
    expect(state.messages[1].isStreaming).toBe(false);
    // Sam's partial message preserved (user can see what was received)
    expect(state.messages[2].content).toBe('Well, I was thinking');
    expect(state.messages[2].isStreaming).toBe(true);
  });
});

describe('connection drop — STREAM_CHUNK after ERROR', () => {
  test('late chunks for wrong message ID are ignored', () => {
    const state: StreamingState = {
      ...initialState,
      conversationId: 'conv-1',
      messages: [
        { id: 'user-1', role: 'user', content: 'Hi', isStreaming: false },
      ],
      status: 'error',
      error: 'Connection lost.',
      initialized: true,
      lastUserContent: 'Hi',
    };

    // Late chunk arrives for a message not at end of list
    const next = streamingReducer(state, {
      type: 'STREAM_CHUNK',
      id: 'ghost-msg',
      text: 'late data',
    });

    // State unchanged — chunk for non-matching ID is ignored
    expect(next).toEqual(state);
  });

  test('STREAM_END after ERROR preserves error status', () => {
    const state: StreamingState = {
      ...initialState,
      conversationId: 'conv-1',
      messages: [
        {
          id: 'ai-1',
          role: 'assistant',
          content: 'Partial',
          isStreaming: true,
        },
      ],
      status: 'error',
      error: 'Timeout.',
      initialized: true,
      lastUserContent: null,
    };

    const next = streamingReducer(state, {
      type: 'STREAM_END',
      id: 'ai-1',
    });

    // Error status preserved even though STREAM_END arrived
    expect(next.status).toBe('error');
    expect(next.messages[0].isStreaming).toBe(false);
  });
});
