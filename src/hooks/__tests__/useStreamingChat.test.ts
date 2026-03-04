import { describe, expect, test } from 'bun:test';
import {
  type ChatMessage,
  initialState,
  type StreamingState,
  streamingReducer,
} from '../useStreamingChat';

describe('streamingReducer', () => {
  test('starts with correct initial state', () => {
    expect(initialState.conversationId).toBeNull();
    expect(initialState.messages).toEqual([]);
    expect(initialState.status).toBe('idle');
    expect(initialState.error).toBeNull();
    expect(initialState.initialized).toBe(false);
  });

  test('INIT sets messages and marks initialized', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'assistant', content: 'Hello', isStreaming: false },
    ];
    const state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages,
    });
    expect(state.conversationId).toBe('conv-1');
    expect(state.messages).toEqual(messages);
    expect(state.initialized).toBe(true);
    expect(state.status).toBe('idle');
    expect(state.error).toBeNull();
  });

  test('INIT preserves existing conversationId when not provided', () => {
    const withConv = { ...initialState, conversationId: 'existing' };
    const state = streamingReducer(withConv, {
      type: 'INIT',
      messages: [],
    });
    expect(state.conversationId).toBe('existing');
  });

  test('ADD_USER_MESSAGE appends message and sets streaming', () => {
    const state = streamingReducer(initialState, {
      type: 'ADD_USER_MESSAGE',
      id: 'msg-1',
      content: 'Hello teacher',
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe('user');
    expect(state.messages[0].content).toBe('Hello teacher');
    expect(state.messages[0].isStreaming).toBe(false);
    expect(state.status).toBe('streaming');
  });

  test('STREAM_START appends empty assistant message', () => {
    const state = streamingReducer(initialState, {
      type: 'STREAM_START',
      id: 'ai-1',
      agentId: 'agent-1',
      agentName: 'Riley',
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe('assistant');
    expect(state.messages[0].content).toBe('');
    expect(state.messages[0].isStreaming).toBe(true);
    expect(state.messages[0].agentId).toBe('agent-1');
    expect(state.messages[0].agentName).toBe('Riley');
    expect(state.status).toBe('streaming');
  });

  test('STREAM_CHUNK appends text to matching message', () => {
    const withMsg: StreamingState = {
      ...initialState,
      messages: [
        { id: 'ai-1', role: 'assistant', content: 'Hel', isStreaming: true },
      ],
      status: 'streaming',
    };
    const state = streamingReducer(withMsg, {
      type: 'STREAM_CHUNK',
      id: 'ai-1',
      text: 'lo!',
    });
    expect(state.messages[0].content).toBe('Hello!');
  });

  test('STREAM_CHUNK does not modify non-matching messages', () => {
    const withMsg: StreamingState = {
      ...initialState,
      messages: [
        { id: 'msg-1', role: 'user', content: 'Hi', isStreaming: false },
        { id: 'ai-1', role: 'assistant', content: '', isStreaming: true },
      ],
      status: 'streaming',
    };
    const state = streamingReducer(withMsg, {
      type: 'STREAM_CHUNK',
      id: 'ai-1',
      text: 'Response',
    });
    expect(state.messages[0].content).toBe('Hi');
    expect(state.messages[1].content).toBe('Response');
  });

  test('STREAM_END marks message as not streaming and resets status', () => {
    const withMsg: StreamingState = {
      ...initialState,
      messages: [
        {
          id: 'ai-1',
          role: 'assistant',
          content: 'Done',
          isStreaming: true,
        },
      ],
      status: 'streaming',
    };
    const state = streamingReducer(withMsg, {
      type: 'STREAM_END',
      id: 'ai-1',
    });
    expect(state.messages[0].isStreaming).toBe(false);
    expect(state.status).toBe('idle');
  });

  test('STREAM_END preserves error status', () => {
    const errorState: StreamingState = {
      ...initialState,
      messages: [
        { id: 'ai-1', role: 'assistant', content: '', isStreaming: true },
      ],
      status: 'error',
      error: 'Stream failed',
    };
    const state = streamingReducer(errorState, {
      type: 'STREAM_END',
      id: 'ai-1',
    });
    expect(state.status).toBe('error');
  });

  test('STREAM_END can update agentId and agentName', () => {
    const withMsg: StreamingState = {
      ...initialState,
      messages: [
        { id: 'ai-1', role: 'assistant', content: 'Hi', isStreaming: true },
      ],
      status: 'streaming',
    };
    const state = streamingReducer(withMsg, {
      type: 'STREAM_END',
      id: 'ai-1',
      agentId: 'agent-2',
      agentName: 'Sam',
    });
    expect(state.messages[0].agentId).toBe('agent-2');
    expect(state.messages[0].agentName).toBe('Sam');
  });

  test('REMOVE_MESSAGE removes matching message by id', () => {
    const withMsgs: StreamingState = {
      ...initialState,
      messages: [
        { id: 'msg-1', role: 'user', content: 'Hi', isStreaming: false },
        { id: 'ai-1', role: 'assistant', content: '', isStreaming: true },
      ],
      status: 'streaming',
    };
    const state = streamingReducer(withMsgs, {
      type: 'REMOVE_MESSAGE',
      id: 'ai-1',
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].id).toBe('msg-1');
  });

  test('ERROR sets error message and status', () => {
    const state = streamingReducer(initialState, {
      type: 'ERROR',
      message: 'Network failure',
    });
    expect(state.status).toBe('error');
    expect(state.error).toBe('Network failure');
    expect(state.initialized).toBe(true);
  });

  test('NUDGE appends a nudge message', () => {
    const state = streamingReducer(initialState, {
      type: 'NUDGE',
      id: 'nudge-1',
      text: 'Consider asking Sam to respond to Riley.',
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe('nudge');
    expect(state.messages[0].content).toBe(
      'Consider asking Sam to respond to Riley.',
    );
    expect(state.messages[0].isStreaming).toBe(false);
    expect(state.messages[0].id).toBe('nudge-1');
  });

  test('NUDGE does not change status', () => {
    const streaming: StreamingState = {
      ...initialState,
      status: 'idle',
    };
    const state = streamingReducer(streaming, {
      type: 'NUDGE',
      id: 'nudge-1',
      text: 'A nudge.',
    });
    expect(state.status).toBe('idle');
  });

  test('NUDGE message can be removed with REMOVE_MESSAGE', () => {
    let state = streamingReducer(initialState, {
      type: 'NUDGE',
      id: 'nudge-1',
      text: 'Dismiss me.',
    });
    expect(state.messages).toHaveLength(1);
    state = streamingReducer(state, {
      type: 'REMOVE_MESSAGE',
      id: 'nudge-1',
    });
    expect(state.messages).toHaveLength(0);
  });

  test('RESET returns to initial state', () => {
    const modified: StreamingState = {
      conversationId: 'conv-1',
      messages: [{ id: '1', role: 'user', content: 'Hi', isStreaming: false }],
      status: 'streaming',
      error: 'something',
      initialized: true,
      lastUserContent: 'Hi',
    };
    const state = streamingReducer(modified, { type: 'RESET' });
    expect(state).toEqual(initialState);
  });

  test('full conversation flow: init → send → stream → done', () => {
    let state = streamingReducer(initialState, {
      type: 'INIT',
      conversationId: 'conv-1',
      messages: [
        {
          id: 'opening',
          role: 'assistant',
          content: 'Hi teacher!',
          isStreaming: false,
        },
      ],
    });
    expect(state.initialized).toBe(true);

    state = streamingReducer(state, {
      type: 'ADD_USER_MESSAGE',
      id: 'user-1',
      content: 'Tell me about evolution',
    });
    expect(state.messages).toHaveLength(2);
    expect(state.status).toBe('streaming');

    state = streamingReducer(state, {
      type: 'STREAM_START',
      id: 'ai-1',
    });
    expect(state.messages).toHaveLength(3);

    state = streamingReducer(state, {
      type: 'STREAM_CHUNK',
      id: 'ai-1',
      text: 'Evolution is ',
    });
    state = streamingReducer(state, {
      type: 'STREAM_CHUNK',
      id: 'ai-1',
      text: 'about change!',
    });
    expect(state.messages[2].content).toBe('Evolution is about change!');

    state = streamingReducer(state, {
      type: 'STREAM_END',
      id: 'ai-1',
    });
    expect(state.messages[2].isStreaming).toBe(false);
    expect(state.status).toBe('idle');
  });
});
