import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ChatBubble } from '@/components/ai-elements/chat-bubble';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { PostConversationPhase } from '@/components/conversation/PostConversationPhase';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useObserver } from '@/hooks/useObserver';
import { usePageTitle } from '@/hooks/usePageTitle';
import { mapApiMessages } from '@/hooks/useStreamingChat';
import { apiFetch } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { formatStatus, getStatusVariant } from '@/lib/status-utils';
import type { ConversationDetail } from '@/types/api';

export const Route = createFileRoute('/_app/conversations/$conversationId')({
  component: ConversationReviewPage,
  validateSearch: (search: Record<string, unknown>) => ({
    view: search.view === 'feedback' ? ('feedback' as const) : undefined,
  }),
});

function ConversationReviewPage() {
  const { conversationId } = Route.useParams();
  const { view } = Route.useSearch();
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.conversation(conversationId),
    queryFn: () =>
      apiFetch<ConversationDetail>(`/api/conversations/${conversationId}`),
  });
  const observer = useObserver();
  const [showObserver, setShowObserver] = useState(view === 'feedback');
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const isMobile = useIsMobile();

  usePageTitle(data?.scenario?.title ?? 'Conversation Review');

  useEffect(() => {
    if (data?.id) {
      observer.loadMessages(data.id);
    }
  }, [data?.id, observer.loadMessages]);

  useEffect(() => {
    if (view === 'feedback' && data?.status === 'completed') {
      setShowObserver(true);
    }
  }, [view, data?.status]);

  const messages = useMemo(
    () =>
      mapApiMessages(
        (data?.messages ?? []).map((m) => ({
          ...m,
          agentName: m.agent?.name,
        })),
      ),
    [data?.messages],
  );

  if (isPending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Alert variant="destructive">
          <AlertDescription>
            {error?.message || 'Conversation not found'}
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild className="mt-4">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  if (showObserver) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowObserver(false)}
            aria-label="Back to conversation"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-sm font-semibold">
              Observer Feedback
            </h1>
            <p className="text-xs text-muted-foreground">
              {data.scenario.title}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTranscriptOpen(!transcriptOpen)}
            className="hidden lg:inline-flex"
          >
            {transcriptOpen ? (
              <PanelLeftClose className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            )}
            {transcriptOpen ? 'Hide Transcript' : 'Show Transcript'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTranscriptOpen(!transcriptOpen)}
            className="lg:hidden"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Transcript
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard">Dashboard</Link>
          </Button>
        </header>
        <div className="flex flex-1 overflow-hidden">
          {transcriptOpen &&
            (isMobile ? (
              <>
                <div
                  className="fixed inset-0 z-40 bg-black/40"
                  onClick={() => setTranscriptOpen(false)}
                  aria-hidden="true"
                />
                <aside className="fixed inset-y-0 left-0 z-50 flex w-full flex-col border-r border-border bg-background shadow-xl sm:w-96">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">
                        Conversation Transcript
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setTranscriptOpen(false)}
                      aria-label="Close transcript"
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </Button>
                  </div>
                  <Conversation className="flex-1">
                    <ConversationContent className="gap-4 px-4 py-4">
                      {messages.map((msg) => (
                        <ChatBubble key={msg.id} message={msg} />
                      ))}
                    </ConversationContent>
                    <ConversationScrollButton />
                  </Conversation>
                </aside>
              </>
            ) : (
              <aside className="flex w-[420px] flex-col border-r border-border bg-muted/30">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">
                    Conversation Transcript
                  </span>
                </div>
                <Conversation className="flex-1">
                  <ConversationContent className="gap-4 px-4 py-4">
                    {messages.map((msg) => (
                      <ChatBubble key={msg.id} message={msg} />
                    ))}
                  </ConversationContent>
                  <ConversationScrollButton />
                </Conversation>
              </aside>
            ))}
          <PostConversationPhase
            observer={observer}
            scenarioTitle={data.scenario.title}
            studentName={data.scenario.studentName}
            conversationMessages={messages}
            conversationDate={data.startedAt}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex-1 min-w-0">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/dashboard">Dashboard</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{data.scenario.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.messageCount} messages
          </p>
        </div>
        <Badge variant={getStatusVariant(data.status)}>
          {formatStatus(data.status)}
        </Badge>
        {(data.status === 'completed' || observer.messages.length > 0) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowObserver(true)}
          >
            Observer Feedback
          </Button>
        )}
      </header>

      <Conversation className="flex-1">
        <ConversationContent className="mx-auto max-w-2xl gap-6 px-4 py-6">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  );
}
