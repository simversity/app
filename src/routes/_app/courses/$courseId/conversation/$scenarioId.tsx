import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationErrorBoundary } from '@/components/ConversationErrorBoundary';
import { ActiveConversationPhase } from '@/components/conversation/ActiveConversationPhase';
import { ConversationHeaderActions } from '@/components/conversation/ConversationHeaderActions';
import { PostConversationPhase } from '@/components/conversation/PostConversationPhase';
import { Button } from '@/components/ui/button';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useConversation } from '@/hooks/useConversation';
import { useObserver } from '@/hooks/useObserver';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch, apiMutate } from '@/lib/api';
import { isAbortError } from '@/lib/error-utils';

export const Route = createFileRoute(
  '/_app/courses/$courseId/conversation/$scenarioId',
)({
  component: ConversationPage,
});

type ScenarioInfo = {
  title: string;
  studentName: string;
};

type Phase = 'conversation' | 'post-conversation';

function ConversationPage() {
  const { courseId, scenarioId } = Route.useParams();
  const navigate = useNavigate();
  const conv = useConversation(scenarioId);
  const observer = useObserver();
  const { minMessagesToComplete } = useAppConfig();
  const [scenarioInfo, setScenarioInfo] = useState<ScenarioInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('conversation');
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [observerOpen, setObserverOpen] = useState(false);
  const onCloseObserver = useCallback(() => setObserverOpen(false), []);
  const completeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => completeAbortRef.current?.abort(), []);

  usePageTitle(
    phase === 'post-conversation'
      ? 'Observer Feedback'
      : (scenarioInfo?.title ?? 'Conversation'),
  );

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{
      scenarios?: { id: string; title: string; studentName: string }[];
    }>(`/api/courses/${courseId}`, { signal: controller.signal })
      .then((course) => {
        const s = course.scenarios?.find((s) => s.id === scenarioId);
        if (s) {
          setScenarioInfo({ title: s.title, studentName: s.studentName });
        }
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setScenarioInfo({ title: 'Conversation', studentName: 'Student' });
      });
    return () => controller.abort();
  }, [courseId, scenarioId]);

  useEffect(() => {
    const controller = new AbortController();
    conv.startConversation(controller.signal);
    return () => controller.abort();
  }, [conv.startConversation]);

  const isStreaming =
    conv.status === 'streaming' || observer.status === 'streaming';

  const handleToggleObserver = async () => {
    if (observerOpen) {
      setObserverOpen(false);
      return;
    }
    if (!observer.initialized && conv.conversationId) {
      await observer.loadMessages(conv.conversationId);
    }
    setObserverOpen(true);
  };

  const handleEndConversation = async () => {
    if (!conv.conversationId || completing) return;
    completeAbortRef.current?.abort();
    const controller = new AbortController();
    completeAbortRef.current = controller;
    setCompleting(true);
    setCompleteError(null);
    try {
      await apiMutate(`/api/conversations/${conv.conversationId}/complete`, {
        method: 'PATCH',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setPhase('post-conversation');
      await observer.loadMessages(conv.conversationId);
      if (controller.signal.aborted) return;
      setObserverOpen(true);
    } catch (err) {
      if (isAbortError(err)) return;
      setCompleteError(
        err instanceof Error ? err.message : 'Failed to complete conversation',
      );
    } finally {
      setCompleting(false);
    }
  };

  return (
    <ConversationErrorBoundary key={scenarioId} onReset={conv.restart}>
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Button variant="ghost" size="icon" asChild>
            <Link
              to="/courses/$courseId"
              params={{ courseId }}
              aria-label="Back to course"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-sm font-semibold">
              {phase === 'post-conversation'
                ? 'Observer Feedback'
                : scenarioInfo?.title || 'Loading...'}
            </h1>
            {phase === 'conversation' && scenarioInfo && (
              <p className="text-xs text-muted-foreground">
                {scenarioInfo.studentName}
              </p>
            )}
          </div>
          {phase === 'conversation' && (
            <ConversationHeaderActions
              observerOpen={observerOpen}
              isStreaming={isStreaming}
              completing={completing}
              canEnd={
                !!conv.conversationId &&
                conv.messages.length >= minMessagesToComplete
              }
              messagesRemaining={Math.max(
                0,
                minMessagesToComplete - conv.messages.length,
              )}
              onToggleObserver={handleToggleObserver}
              onEndConversation={handleEndConversation}
              onRestart={conv.restart}
            />
          )}
          {phase === 'post-conversation' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate({ to: '/courses/$courseId', params: { courseId } })
              }
            >
              Back to course
            </Button>
          )}
        </header>

        <div className="flex flex-1 overflow-hidden">
          {phase === 'post-conversation' && (
            <PostConversationPhase observer={observer} />
          )}

          {phase === 'conversation' && (
            <ActiveConversationPhase
              conv={conv}
              observer={observer}
              observerOpen={observerOpen}
              completing={completing}
              completeError={completeError}
              onCloseObserver={onCloseObserver}
            />
          )}
        </div>
      </div>
    </ConversationErrorBoundary>
  );
}
