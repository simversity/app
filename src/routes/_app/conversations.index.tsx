import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Eye, History, PlayCircle, Search } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { formatStatus, getStatusVariant } from '@/lib/status-utils';

type ConversationItem = {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  studentName: string;
  courseId: string;
  messageCount: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
};

export const Route = createFileRoute('/_app/conversations/')({
  component: ConversationHistory,
  validateSearch: (search: Record<string, unknown>) => ({
    status: (search.status as string) || '',
    q: (search.q as string) || '',
    page: Number(search.page) || 0,
  }),
});

const PAGE_SIZE = 20;

function ConversationHistory() {
  const { status, q, page } = Route.useSearch();
  const navigate = Route.useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.conversationList({
      status,
      search: q,
      page,
    }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (q) params.set('search', q);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(page * PAGE_SIZE));
      return apiFetch<{ conversations: ConversationItem[]; total: number }>(
        `/api/conversations?${params}`,
      );
    },
  });

  usePageTitle('History');

  const conversations = data?.conversations ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const statusFilters = [
    { label: 'All', value: '' },
    { label: 'Active', value: 'active' },
    { label: 'Completed', value: 'completed' },
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center gap-3">
        <History className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Conversation History</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review past conversations and feedback
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by scenario name..."
            defaultValue={q}
            onChange={(e) => {
              const value = e.target.value;
              clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => {
                navigate({
                  search: { status, q: value, page: 0 },
                });
              }, 300);
            }}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {statusFilters.map((f) => (
            <Button
              key={f.value}
              variant={status === f.value ? 'default' : 'outline'}
              size="sm"
              onClick={() =>
                navigate({ search: { status: f.value, q, page: 0 } })
              }
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {isPending ? (
        <div className="mt-8 flex justify-center">
          <Spinner className="size-8" />
        </div>
      ) : error ? (
        <div className="mt-8 rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{error.message}</p>
        </div>
      ) : conversations.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
          <History className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-4 text-sm font-medium">No conversations found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {q || status
              ? 'Try adjusting your search or filters.'
              : 'Start a conversation from the courses page.'}
          </p>
          {!q && !status && (
            <Button asChild variant="outline" className="mt-4">
              <Link to="/courses">Browse courses</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-3">
            {conversations.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50"
              >
                <Link
                  to="/conversations/$conversationId"
                  params={{ conversationId: c.id }}
                  search={{ view: undefined }}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate text-sm font-medium">
                    {c.scenarioTitle}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    with {c.studentName} &middot; {c.messageCount} messages
                    &middot;{' '}
                    {new Date(c.startedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </Link>
                <div className="ml-4 flex items-center gap-2">
                  {c.status === 'active' && (
                    <Link
                      to="/courses/$courseId/conversation/$scenarioId"
                      params={{
                        courseId: c.courseId,
                        scenarioId: c.scenarioId,
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                      <PlayCircle className="h-3 w-3" />
                      Resume
                    </Link>
                  )}
                  {c.status === 'completed' && (
                    <Link
                      to="/conversations/$conversationId"
                      params={{ conversationId: c.id }}
                      search={{ view: 'feedback' }}
                      className="inline-flex items-center gap-1 rounded-md border border-observer/30 bg-observer/10 px-2 py-1 text-xs font-medium text-observer-foreground transition-colors hover:bg-observer/20"
                    >
                      <Eye className="h-3 w-3" />
                      Feedback
                    </Link>
                  )}
                  <Badge variant={getStatusVariant(c.status)}>
                    {formatStatus(c.status)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {total} conversation{total !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() =>
                    navigate({ search: { status, q, page: page - 1 } })
                  }
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() =>
                    navigate({ search: { status, q, page: page + 1 } })
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
