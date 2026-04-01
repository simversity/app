import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationErrorBoundary } from '@/components/ConversationErrorBoundary';
import { ActiveConversationPhase } from '@/components/conversation/ActiveConversationPhase';
import { ConversationHeaderActions } from '@/components/conversation/ConversationHeaderActions';
import { PostConversationPhase } from '@/components/conversation/PostConversationPhase';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useConversation } from '@/hooks/useConversation';
import { useObserver } from '@/hooks/useObserver';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch, apiMutate } from '@/lib/api';
import { isAbortError } from '@/lib/error-utils';
import { queryKeys } from '@/lib/query-keys';
import type { CourseDetail } from '@/types/api';

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

  // Use cached course data for breadcrumb and scenario info
  const { data: courseData } = useQuery({
    queryKey: queryKeys.course(courseId),
    queryFn: () => apiFetch<CourseDetail>(`/api/courses/${courseId}`),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (courseData) {
      const s = courseData.scenarios?.find((s) => s.id === scenarioId);
      if (s) {
        setScenarioInfo({ title: s.title, studentName: s.studentName });
      }
    }
  }, [courseData, scenarioId]);

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
          <div className="flex-1 min-w-0">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/courses">Courses</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/courses/$courseId" params={{ courseId }}>
                      {courseData?.title ?? 'Course'}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {phase === 'post-conversation'
                      ? 'Observer Feedback'
                      : scenarioInfo?.title || 'Loading...'}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            {phase === 'conversation' && scenarioInfo && (
              <p className="mt-0.5 text-xs text-muted-foreground">
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
            <PostConversationPhase
              observer={observer}
              scenarioTitle={scenarioInfo?.title}
              studentName={scenarioInfo?.studentName}
              conversationMessages={conv.messages}
              conversationDate={new Date().toISOString()}
            />
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
