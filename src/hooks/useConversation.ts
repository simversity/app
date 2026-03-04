import { useCallback, useRef } from 'react';
import { apiMutate } from '@/lib/api';
import { getUserFriendlyMessage } from '@/lib/error-messages';
import { isAbortError } from '@/lib/error-utils';
import type { ChatMessage } from './useStreamingChat';
import {
  mapApiMessages,
  useSendMessage,
  useStreamingChat,
} from './useStreamingChat';

export type { ChatMessage };

const buildEndpoint = (id: string) => `/api/conversations/${id}/messages`;

/** Abandon a conversation server-side (best-effort, fire-and-forget). */
function abandonConversation(conversationId: string) {
  apiMutate(`/api/conversations/${conversationId}/abandon`, {
    method: 'PATCH',
  }).catch(() => {
    // Best-effort: ignore errors (conversation may already be completed/abandoned)
  });
}

export function useConversation(scenarioId: string) {
  const { state, dispatch, abortRef } = useStreamingChat();
  // Use a ref so startConversation can read the current conversationId
  // without adding it to its dependency array (which would cause re-fires).
  const conversationIdRef = useRef(state.conversationId);
  conversationIdRef.current = state.conversationId;

  const startConversation = useCallback(
    async (signal?: AbortSignal) => {
      // Abandon the previous conversation if one exists
      if (conversationIdRef.current) {
        abandonConversation(conversationIdRef.current);
      }

      dispatch({ type: 'RESET' });

      try {
        const data = await apiMutate<{
          conversation: { id: string };
          messages: {
            id: string;
            role: string;
            content: string;
            agentId?: string;
            agentName?: string | null;
          }[];
        }>('/api/conversations', {
          body: { scenarioId },
          signal,
        });
        dispatch({
          type: 'INIT',
          conversationId: data.conversation.id,
          messages: mapApiMessages(data.messages),
        });
      } catch (err) {
        if (isAbortError(err)) return;
        dispatch({
          type: 'ERROR',
          message: getUserFriendlyMessage(err),
        });
      }
    },
    [scenarioId, dispatch],
  );

  const sendMessage = useSendMessage(buildEndpoint, state, dispatch, abortRef);

  const restart = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    startConversation(controller.signal);
  }, [startConversation, abortRef]);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, [dispatch]);

  const dismissNudge = useCallback(
    (id: string) => {
      dispatch({ type: 'REMOVE_MESSAGE', id });
    },
    [dispatch],
  );

  return {
    ...state,
    startConversation,
    sendMessage,
    restart,
    clearError,
    dismissNudge,
  };
}
