import { useCallback, useMemo, useState } from 'react';
import { ChatBubble } from '@/components/ai-elements/chat-bubble';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { ChatFooter } from '@/components/ChatFooter';
import { ChatInputForm } from '@/components/ChatInputForm';
import { DailyBudgetWarning } from '@/components/conversation/DailyBudgetWarning';
import { ObserverPanel } from '@/components/ObserverPanel';
import { StreamingStatusIndicator } from '@/components/StreamingStatusIndicator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAppConfig } from '@/hooks/useAppConfig';
import type { useConversation } from '@/hooks/useConversation';
import type { useObserver } from '@/hooks/useObserver';
import { OBSERVER_USED_KEY } from '@/lib/constants';

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
  const config = useAppConfig();
  const messageCount = conv.messages.length;
  const maxMessages = config.maxMessagesPerConversation;
  const messageLimitReached = messageCount >= maxMessages;
  const messageLimitWarning =
    !messageLimitReached && messageCount >= maxMessages * 0.8;

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

  // Show observer tip after 4th user message.
  // Persist dismissal permanently only once the user has actually used the observer.
  const userMessageCount = conv.messages.filter(
    (m) => m.role === 'user',
  ).length;
  const observerHasBeenUsed =
    observerOpen || observer.messages.length > 0 || observer.initialized;
  const [tipDismissed, setTipDismissed] = useState(() => {
    try {
      return localStorage.getItem(OBSERVER_USED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const showObserverTip =
    !tipDismissed && userMessageCount >= 4 && !observerOpen;

  const handleDismissTip = useCallback(() => {
    setTipDismissed(true);
    if (observerHasBeenUsed) {
      try {
        localStorage.setItem(OBSERVER_USED_KEY, '1');
      } catch {
        // ignore
      }
    }
  }, [observerHasBeenUsed]);

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
                  onClick={handleDismissTip}
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
          <DailyBudgetWarning />
          {messageLimitWarning && (
            <div className="mx-auto mb-2 max-w-2xl rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-2.5 text-sm text-muted-foreground">
              You&apos;re approaching the message limit ({messageCount}/
              {maxMessages}). Consider wrapping up the conversation.
            </div>
          )}
          {messageLimitReached && (
            <Alert variant="destructive" className="mx-auto mb-2 max-w-2xl">
              <AlertDescription>
                Message limit reached. Please end the conversation or start a
                new one.
              </AlertDescription>
            </Alert>
          )}
          <div className="mx-auto max-w-2xl">
            <ChatInputForm
              onSend={conv.sendMessage}
              placeholder={
                messageLimitReached
                  ? 'Message limit reached'
                  : 'Respond to the student...'
              }
              disabled={
                conv.status === 'streaming' ||
                !conv.conversationId ||
                completing ||
                messageLimitReached
              }
              isStreaming={conv.status === 'streaming'}
              streamingLabel={streamingLabel}
              draftKey={conv.conversationId ?? undefined}
              status={conv.status}
              lastUserContent={conv.lastUserContent}
              conversationId={conv.conversationId}
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
          lastUserContent={observer.lastUserContent}
        />
      )}
    </>
  );
}
