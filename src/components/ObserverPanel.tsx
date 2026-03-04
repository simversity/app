import { X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
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
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ChatMessage, StreamingStatus } from '@/hooks/useStreamingChat';

type ObserverPanelProps = {
  messages: ChatMessage[];
  status: StreamingStatus;
  error: string | null;
  initialized: boolean;
  onSend: (content: string) => void;
  onClose: () => void;
};

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function ObserverPanel({
  messages,
  status,
  error,
  initialized,
  onSend,
  onClose,
}: ObserverPanelProps) {
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const onCloseStable = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    if (!isMobile || !panelRef.current) return;

    const container = panelRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;

    const raf = requestAnimationFrame(() => {
      const focusable = getFocusableElements(container);
      focusable[0]?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [isMobile]);

  return (
    <>
      {isMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onCloseStable}
          aria-hidden="true"
        />
      )}
      <aside
        ref={panelRef}
        aria-label="Observer panel"
        className="flex w-96 flex-col border-l border-border bg-background max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-50 max-lg:w-full max-lg:sm:w-96 max-lg:shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ObserverIcon />
            <span className="text-sm font-semibold">Observer</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCloseStable}
            aria-label="Close observer panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Conversation className="flex-1">
          <ConversationContent
            className="gap-4 px-4 py-4"
            role="log"
            aria-live="polite"
            aria-label="Observer messages"
          >
            {messages.length === 0 &&
              status !== 'streaming' &&
              status !== 'error' && (
                <div className="rounded-md border border-dashed border-observer/30 bg-observer/5 p-4">
                  <p className="text-xs font-medium text-observer-foreground">
                    The observer is watching your conversation.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Open this panel anytime to request coaching feedback, or end
                    the conversation for a full analysis.
                  </p>
                </div>
              )}

            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} variant="observer" />
            ))}

            <StreamingStatusIndicator
              status={status}
              loadingLabel="Connecting to observer..."
              error={error}
              spinnerClassName="size-4 text-observer"
            />
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <ChatFooter className="px-3">
          <ChatInputForm
            onSend={onSend}
            placeholder="Ask the observer..."
            disabled={status === 'streaming' || !initialized}
            isStreaming={status === 'streaming'}
            streamingLabel="Observer is responding..."
          />
        </ChatFooter>
      </aside>
    </>
  );
}
