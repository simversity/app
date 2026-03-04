import {
  type Dispatch,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import { sendStreamingMessage } from './sse-stream';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'nudge';
  content: string;
  isStreaming: boolean;
  agentId?: string;
  agentName?: string;
};

export type StreamingStatus = 'idle' | 'streaming' | 'error';

export type StreamingState = {
  conversationId: string | null;
  messages: ChatMessage[];
  status: StreamingStatus;
  error: string | null;
  initialized: boolean;
  lastUserContent: string | null;
};

export type StreamingAction =
  | { type: 'INIT'; conversationId?: string; messages: ChatMessage[] }
  | { type: 'ADD_USER_MESSAGE'; id: string; content: string }
  | { type: 'STREAM_START'; id: string; agentId?: string; agentName?: string }
  | { type: 'STREAM_CHUNK'; id: string; text: string }
  | {
      type: 'STREAM_END';
      id: string;
      serverId?: string;
      agentId?: string;
      agentName?: string;
    }
  | { type: 'REMOVE_MESSAGE'; id: string }
  | { type: 'NUDGE'; id: string; text: string }
  | { type: 'ERROR'; message: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESET' };

export const initialState: StreamingState = {
  conversationId: null,
  messages: [],
  status: 'idle',
  error: null,
  initialized: false,
  lastUserContent: null,
};

export function streamingReducer(
  state: StreamingState,
  action: StreamingAction,
): StreamingState {
  switch (action.type) {
    case 'INIT':
      return {
        ...state,
        conversationId: action.conversationId ?? state.conversationId,
        messages: action.messages,
        status: 'idle',
        error: null,
        initialized: true,
      };
    case 'ADD_USER_MESSAGE':
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
        lastUserContent: action.content,
      };
    case 'STREAM_START':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: action.id,
            role: 'assistant',
            content: '',
            isStreaming: true,
            agentId: action.agentId,
            agentName: action.agentName,
          },
        ],
        status: 'streaming',
      };
    case 'STREAM_CHUNK': {
      const msgs = state.messages;
      const last = msgs[msgs.length - 1];
      if (!last || last.id !== action.id) return state;
      const updated = msgs.slice();
      updated[updated.length - 1] = {
        ...last,
        content: last.content + action.text,
      };
      return { ...state, messages: updated };
    }
    case 'STREAM_END':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id
            ? {
                ...m,
                id: action.serverId ?? m.id,
                isStreaming: false,
                ...(action.agentId && { agentId: action.agentId }),
                ...(action.agentName && { agentName: action.agentName }),
              }
            : m,
        ),
        status: state.status === 'error' ? 'error' : 'idle',
      };
    case 'REMOVE_MESSAGE':
      return {
        ...state,
        messages: state.messages.filter((m) => m.id !== action.id),
      };
    case 'NUDGE':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: action.id,
            role: 'nudge',
            content: action.text,
            isStreaming: false,
          },
        ],
      };
    case 'ERROR':
      return {
        ...state,
        status: 'error',
        error: action.message,
        initialized: true,
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        status: 'idle',
        error: null,
      };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

/**
 * Map raw API message objects to ChatMessage[].
 * Used by both useConversation and useObserver to avoid duplication.
 */
export function mapApiMessages(
  raw: {
    id: string;
    role: string;
    content: string;
    agentId?: string;
    agentName?: string | null;
  }[],
): ChatMessage[] {
  return raw.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    isStreaming: false,
    agentId: m.agentId || undefined,
    agentName: m.agentName || undefined,
  }));
}

export function useStreamingChat() {
  const [state, dispatch] = useReducer(streamingReducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { state, dispatch, abortRef };
}

/**
 * Shared sendMessage callback used by both useConversation and useObserver.
 * Guards against sending when no conversationId or already streaming.
 */
export function useSendMessage(
  endpointBuilder: (conversationId: string) => string,
  state: StreamingState,
  dispatch: Dispatch<StreamingAction>,
  abortRef: React.MutableRefObject<AbortController | null>,
) {
  const stateRef = useRef(state);
  stateRef.current = state;

  return useCallback(
    async (content: string) => {
      const { conversationId, status } = stateRef.current;
      if (!conversationId || status === 'streaming') return;
      await sendStreamingMessage(
        endpointBuilder(conversationId),
        content,
        dispatch,
        abortRef,
      );
    },
    [endpointBuilder, dispatch, abortRef],
  );
}
