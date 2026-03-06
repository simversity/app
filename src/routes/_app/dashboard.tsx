import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowRight,
  BookOpen,
  Eye,
  GraduationCap,
  MessageSquare,
  Search,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { queryKeys } from '@/lib/query-keys';
import { formatStatus, getStatusVariant } from '@/lib/status-utils';
import type { DashboardSummary } from '@/types/api';

export const Route = createFileRoute('/_app/dashboard')({
  component: Dashboard,
});

function Dashboard() {
  const { data: session } = useSession();
  const {
    data: summary,
    isPending,
    error,
  } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiFetch<DashboardSummary>('/api/progress/summary'),
  });

  usePageTitle('Dashboard');

  const firstName = session?.user?.name?.split(' ')[0] || 'there';
  const isNewUser = !isPending && (summary?.totalConversations ?? 0) === 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">
          {isNewUser ? `Welcome, ${firstName}` : `Welcome back, ${firstName}`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isNewUser
            ? 'Practice responding to students with common misconceptions'
            : 'Continue building your pedagogical content knowledge'}
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {/* First-time user onboarding */}
      {isNewUser && (
        <Card className="mt-8 border-primary/30 bg-primary/5 py-0">
          <CardContent className="py-6">
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-primary/10 p-3">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">
                  Start your first practice
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Simversity simulates students with real misconceptions. You'll
                  practice responding, then get research-grounded feedback from
                  an observer on your teaching approach.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      1
                    </span>
                    Choose a scenario
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      2
                    </span>
                    Converse with the student
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      3
                    </span>
                    Review observer feedback
                  </div>
                </div>
                <Button asChild className="mt-5">
                  <Link to="/courses">
                    <BookOpen className="h-4 w-4" />
                    Browse scenarios
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Your Own Scenario */}
      {!isPending && (
        <Card className="mt-6 py-0">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold">
                Create your own scenario
              </h3>
              <p className="text-xs text-muted-foreground">
                Design a custom student persona to practice with
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/create-scenario">
                <ArrowRight className="h-3.5 w-3.5" />
                Build
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {isPending ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {['conversations', 'scenarios', 'exchanges'].map((id) => (
            <Card key={id} className="gap-0 py-0">
              <CardContent className="flex items-center gap-3 py-5">
                <div className="h-8 w-8 animate-pulse rounded-md bg-muted" />
                <div className="space-y-2">
                  <div className="h-6 w-12 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        !isNewUser && (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={MessageSquare}
              label="Conversations"
              value={summary?.totalConversations ?? 0}
            />
            <StatCard
              icon={GraduationCap}
              label="Scenarios Practiced"
              value={summary?.totalScenariosPracticed ?? 0}
            />
            <StatCard
              icon={BookOpen}
              label="Messages Sent"
              value={summary?.totalMessages ?? 0}
            />
          </div>
        )
      )}

      {/* Recent Activity */}
      {!isPending && !isNewUser && (
        <RecentActivity conversations={summary?.recentConversations} />
      )}
    </div>
  );
}

function RecentActivity({
  conversations,
}: {
  conversations: DashboardSummary['recentConversations'] | undefined;
}) {
  const [search, setSearch] = useState('');

  const filtered = conversations?.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.scenarioTitle.toLowerCase().includes(q) ||
      c.studentName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recent Activity</h2>
        <Link
          to="/courses"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          Browse courses
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search conversations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="mt-3 space-y-3">
        {filtered?.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No conversations found
          </p>
        )}
        {filtered?.map((c) => (
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
              <p className="truncate text-sm font-medium">{c.scenarioTitle}</p>
              <p className="text-xs text-muted-foreground">
                with {c.studentName} &middot; {c.messageCount} messages
              </p>
            </Link>
            <div className="ml-4 flex items-center gap-2">
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
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MessageSquare;
  label: string;
  value: number;
}) {
  return (
    <Card className="gap-0 py-0" aria-label={`${label}: ${value}`}>
      <CardContent className="flex items-center gap-3 py-5">
        <div className="rounded-md bg-primary/10 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
