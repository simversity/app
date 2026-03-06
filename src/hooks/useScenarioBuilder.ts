import { useCallback, useReducer, useRef, useState } from 'react';
import { apiMutate } from '@/lib/api';
import { fetchSSE } from './sse-stream';

type BuilderMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming: boolean;
};

type ScenarioData = {
  scenarioTitle: string;
  scenarioDescription: string;
  subject: string;
  gradeLevel?: string;
  activityContext?: string;
  students: {
    name: string;
    description: string;
    systemPrompt: string;
    openingMessage: string;
  }[];
};

type BuilderState = {
  messages: BuilderMessage[];
  status: 'idle' | 'streaming' | 'error';
  error: string | null;
  parsedScenario: ScenarioData | null;
};

type BuilderAction =
  | { type: 'ADD_USER'; id: string; content: string }
  | { type: 'STREAM_START'; id: string }
  | { type: 'STREAM_CHUNK'; id: string; text: string }
  | { type: 'STREAM_END'; id: string }
  | { type: 'REMOVE'; id: string }
  | { type: 'ERROR'; message: string }
  | { type: 'SET_SCENARIO'; data: ScenarioData };

function reducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'ADD_USER':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: action.id,
            role: 'user',
            content: action.content,
            isStreaming: false,
          },
        ],
        status: 'streaming',
        error: null,
      };
    case 'STREAM_START':
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: action.id, role: 'assistant', content: '', isStreaming: true },
        ],
        status: 'streaming',
      };
    case 'STREAM_CHUNK': {
      const msgs = state.messages.slice();
      const last = msgs[msgs.length - 1];
      if (!last || last.id !== action.id) return state;
      msgs[msgs.length - 1] = { ...last, content: last.content + action.text };
      return { ...state, messages: msgs };
    }
    case 'STREAM_END':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, isStreaming: false } : m,
        ),
        status: 'idle',
      };
    case 'REMOVE':
      return {
        ...state,
        messages: state.messages.filter((m) => m.id !== action.id),
      };
    case 'ERROR':
      return { ...state, status: 'error', error: action.message };
    case 'SET_SCENARIO':
      return { ...state, parsedScenario: action.data };
    default:
      return state;
  }
}

function parseScenarioFromText(text: string): ScenarioData | null {
  const match = text.match(/<scenario>\s*([\s\S]*?)\s*<\/scenario>/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (
      parsed.scenarioTitle &&
      parsed.subject &&
      Array.isArray(parsed.students) &&
      parsed.students.length > 0
    ) {
      return parsed as ScenarioData;
    }
  } catch {
    // JSON parse failed
  }
  return null;
}

export function useScenarioBuilder() {
  const [state, dispatch] = useReducer(reducer, {
    messages: [],
    status: 'idle',
    error: null,
    parsedScenario: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const [isCreating, setIsCreating] = useState(false);

  const sendMessage = useCallback(
    async (content: string) => {
      if (state.status === 'streaming') return;

      const userMsgId = crypto.randomUUID();
      dispatch({ type: 'ADD_USER', id: userMsgId, content });

      const assistantMsgId = crypto.randomUUID();
      dispatch({ type: 'STREAM_START', id: assistantMsgId });

      const apiMessages = [
        ...state.messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content },
      ];

      streamingRef.current = true;
      try {
        let fullText = '';
        await fetchSSE(
          '/api/scenario-builder/chat',
          { messages: apiMessages },
          {
            abortRef,
            onDelta: (text) => {
              fullText += text;
              dispatch({ type: 'STREAM_CHUNK', id: assistantMsgId, text });
            },
            onDone: () => {
              streamingRef.current = false;
              dispatch({ type: 'STREAM_END', id: assistantMsgId });
              const scenario = parseScenarioFromText(fullText);
              if (scenario) {
                dispatch({ type: 'SET_SCENARIO', data: scenario });
              }
            },
            onError: (message) => {
              streamingRef.current = false;
              dispatch({ type: 'REMOVE', id: assistantMsgId });
              dispatch({ type: 'ERROR', message });
            },
          },
        );
      } catch (err) {
        dispatch({ type: 'REMOVE', id: assistantMsgId });
        dispatch({
          type: 'ERROR',
          message:
            err instanceof Error ? err.message : 'Failed to send message',
        });
      } finally {
        if (streamingRef.current) {
          streamingRef.current = false;
          dispatch({ type: 'STREAM_END', id: assistantMsgId });
        }
      }
    },
    [state.messages, state.status],
  );

  const createScenario = useCallback(async () => {
    if (!state.parsedScenario) return null;
    setIsCreating(true);
    try {
      const result = await apiMutate<{ courseId: string; scenarioId: string }>(
        '/api/scenario-builder/create',
        { body: state.parsedScenario },
      );
      return result;
    } catch (err) {
      dispatch({
        type: 'ERROR',
        message:
          err instanceof Error ? err.message : 'Failed to create scenario',
      });
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [state.parsedScenario]);

  return {
    messages: state.messages,
    status: state.status,
    error: state.error,
    parsedScenario: state.parsedScenario,
    isCreating,
    sendMessage,
    createScenario,
  };
}
