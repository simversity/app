import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChatBubble } from '@/components/ai-elements/chat-bubble';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { ChatFooter } from '@/components/ChatFooter';
import { ChatInputForm } from '@/components/ChatInputForm';
import { ObserverPanel } from '@/components/ObserverPanel';
import { StreamingStatusIndicator } from '@/components/StreamingStatusIndicator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { useConversation } from '@/hooks/useConversation';
import type { useObserver } from '@/hooks/useObserver';

type ActiveConversationPhaseProps = {
  conv: ReturnType<typeof useConversation>;
  observer: ReturnType<typeof useObserver>;
  observerOpen: boolean;
  completing: boolean;
  completeError: string | null;
  onCloseObserver: () => void;
};

export function ActiveConversationPhase({
  conv,
  observer,
  observerOpen,
  completing,
  completeError,
  onCloseObserver,
}: ActiveConversationPhaseProps) {
  const handleRetry = useCallback(() => {
    if (conv.lastUserContent) {
      conv.clearError();
      conv.sendMessage(conv.lastUserContent);
    }
  }, [conv.lastUserContent, conv.clearError, conv.sendMessage]);

  const handleDismissNudge = useCallback(
    (id: string) => {
      conv.dismissNudge(id);
    },
    [conv.dismissNudge],
  );

  // Derive streaming agent name for multi-agent pacing indicator
  const streamingAgentName = useMemo(() => {
    if (conv.status !== 'streaming') return null;
    const lastMsg = conv.messages[conv.messages.length - 1];
    if (lastMsg?.isStreaming && lastMsg.agentName) return lastMsg.agentName;
    return null;
  }, [conv.status, conv.messages]);

  // Show observer tip after 4th user message, once per session
  const userMessageCount = conv.messages.filter(
    (m) => m.role === 'user',
  ).length;
  const [tipDismissed, setTipDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('simversity:observer-tip-shown') === '1';
    } catch (e) {
      console.debug('sessionStorage read failed:', e);
      return false;
    }
  });
  const showObserverTip =
    !tipDismissed && userMessageCount >= 4 && !observerOpen;

  useEffect(() => {
    if (showObserverTip) {
      try {
        sessionStorage.setItem('simversity:observer-tip-shown', '1');
      } catch (e) {
        console.debug('sessionStorage write failed:', e);
      }
    }
  }, [showObserverTip]);

  const streamingLabel = streamingAgentName
    ? `${streamingAgentName} is responding...`
    : 'Student is responding...';

  return (
    <>
      <div className="flex flex-1 flex-col">
        <Conversation className="flex-1">
          <ConversationContent
            className="mx-auto max-w-2xl gap-6 px-4 py-6"
            aria-label="Conversation messages"
          >
            {conv.messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                message={msg}
                onDismissNudge={
                  msg.role === 'nudge' ? handleDismissNudge : undefined
                }
              />
            ))}

            <StreamingStatusIndicator
              status={conv.status}
              loadingLabel="Starting conversation..."
              error={conv.error}
              onRetry={conv.lastUserContent ? handleRetry : undefined}
              onDismissError={conv.error ? conv.clearError : undefined}
            />
            {showObserverTip && (
              <div className="mx-auto flex max-w-md items-center gap-2 rounded-lg border border-observer/30 bg-observer/5 px-4 py-2.5 text-sm text-muted-foreground">
                <span className="flex-1">
                  Tip: You can ask the observer for feedback at any time during
                  the conversation.
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setTipDismissed(true)}
                >
                  Dismiss
                </button>
              </div>
            )}
            {completeError && (
              <Alert variant="destructive">
                <AlertDescription>{completeError}</AlertDescription>
              </Alert>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <ChatFooter className="bg-background">
          <div className="mx-auto max-w-2xl">
            <ChatInputForm
              onSend={conv.sendMessage}
              placeholder="Respond to the student..."
              disabled={
                conv.status === 'streaming' ||
                !conv.conversationId ||
                completing
              }
              isStreaming={conv.status === 'streaming'}
              streamingLabel={streamingLabel}
              draftKey={conv.conversationId ?? undefined}
            />
          </div>
        </ChatFooter>
      </div>

      {observerOpen && (
        <ObserverPanel
          messages={observer.messages}
          status={observer.status}
          error={observer.error}
          initialized={observer.initialized}
          onSend={(text) => observer.sendMessage(text)}
          onClose={onCloseObserver}
        />
      )}
    </>
  );
}
