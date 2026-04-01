import { Download, Eye } from 'lucide-react';
import { useCallback } from 'react';
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
import { Button } from '@/components/ui/button';
import type { useObserver } from '@/hooks/useObserver';
import type { ChatMessage } from '@/hooks/useStreamingChat';
import {
  downloadMarkdown,
  generateFeedbackMarkdown,
} from '@/lib/export-feedback';

type PostConversationPhaseProps = {
  observer: ReturnType<typeof useObserver>;
  scenarioTitle?: string;
  studentName?: string;
  conversationMessages?: ChatMessage[];
  conversationDate?: string;
};

export function PostConversationPhase({
  observer,
  scenarioTitle,
  studentName,
  conversationMessages,
  conversationDate,
}: PostConversationPhaseProps) {
  const canExport =
    observer.messages.length > 0 && scenarioTitle && conversationMessages;

  const handleExport = useCallback(() => {
    if (!canExport) return;
    const md = generateFeedbackMarkdown({
      scenarioTitle: scenarioTitle ?? 'Conversation',
      studentName: studentName ?? 'Student',
      date: conversationDate ?? new Date().toISOString(),
      conversationMessages: conversationMessages ?? [],
      observerMessages: observer.messages,
    });
    const slug = (scenarioTitle ?? 'feedback')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40);
    downloadMarkdown(md, `feedback-${slug}.md`);
  }, [
    canExport,
    scenarioTitle,
    studentName,
    conversationDate,
    conversationMessages,
    observer.messages,
  ]);
  return (
    <div className="flex flex-1 flex-col">
      <Conversation className="flex-1">
        <ConversationContent
          className="mx-auto max-w-2xl gap-4 px-4 py-8"
          aria-label="Observer feedback messages"
        >
          <div className="mb-2 flex items-center gap-3">
            <ObserverIcon size="lg" />
            <div className="flex-1">
              <h2 className="text-xl font-bold">Observer Feedback</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Ask the observer about your teaching approach
              </p>
            </div>
            {canExport && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleExport}
                aria-label="Export feedback"
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
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
            status={observer.status}
            lastUserContent={observer.lastUserContent}
          />
        </div>
      </ChatFooter>
    </div>
  );
}
