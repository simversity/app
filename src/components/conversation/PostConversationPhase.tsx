import { Eye } from 'lucide-react';
import { ChatBubble } from '@/components/ai-elements/chat-bubble';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { ChatFooter } from '@/components/ChatFooter';
import { ChatInputForm } from '@/components/ChatInputForm';
import { ObserverIcon } from '@/components/ObserverIcon';
import { StreamingStatusIndicator } from '@/components/StreamingStatusIndicator';
import type { useObserver } from '@/hooks/useObserver';

type PostConversationPhaseProps = {
  observer: ReturnType<typeof useObserver>;
};

export function PostConversationPhase({
  observer,
}: PostConversationPhaseProps) {
  return (
    <div className="flex flex-1 flex-col">
      <Conversation className="flex-1">
        <ConversationContent
          className="mx-auto max-w-2xl gap-4 px-4 py-8"
          aria-label="Observer feedback messages"
        >
          <div className="mb-2 flex items-center gap-3">
            <ObserverIcon size="lg" />
            <div>
              <h2 className="text-xl font-bold">Observer Feedback</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Ask the observer about your teaching approach
              </p>
            </div>
          </div>

          {observer.messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} variant="observer" />
          ))}

          <StreamingStatusIndicator
            status={observer.status}
            loadingLabel="Loading observer..."
            error={observer.error}
          />

          {observer.initialized &&
            observer.messages.length === 0 &&
            observer.status === 'idle' && (
              <div className="rounded-md border border-dashed border-border p-6 text-center">
                <Eye className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-3 text-sm font-medium">
                  Conversation complete
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ask the observer for feedback on your teaching approach, or
                  request a full analysis.
                </p>
              </div>
            )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <ChatFooter className="bg-background">
        <div className="mx-auto max-w-2xl">
          <ChatInputForm
            onSend={observer.sendMessage}
            placeholder="Ask the observer about your teaching..."
            disabled={observer.status === 'streaming' || !observer.initialized}
            isStreaming={observer.status === 'streaming'}
            streamingLabel="Observer is responding..."
          />
        </div>
      </ChatFooter>
    </div>
  );
}
