import { useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { getUserFriendlyMessage } from '@/lib/error-messages';
import { isAbortError } from '@/lib/error-utils';
import {
  mapApiMessages,
  useSendMessage,
  useStreamingChat,
} from './useStreamingChat';

const buildEndpoint = (id: string) => `/api/conversations/${id}/observer`;

export function useObserver() {
  const { state, dispatch, abortRef } = useStreamingChat();
  const loadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => loadAbortRef.current?.abort(), []);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;

      dispatch({ type: 'INIT', conversationId, messages: [] });

      try {
        const data = await apiFetch<{
          messages?: { id: string; role: string; content: string }[];
        }>(`/api/conversations/${conversationId}/observer`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        dispatch({
          type: 'INIT',
          conversationId,
          messages: mapApiMessages(data.messages || []),
        });
      } catch (err) {
        if (isAbortError(err)) return;
        dispatch({
          type: 'ERROR',
          message: getUserFriendlyMessage(err),
        });
      }
    },
    [dispatch],
  );

  const sendMessage = useSendMessage(buildEndpoint, state, dispatch, abortRef);

  return {
    ...state,
    loadMessages,
    sendMessage,
  };
}
