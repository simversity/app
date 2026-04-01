import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  Archive,
  BookOpen,
  KeyRound,
  Plus,
  RotateCcw,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch, apiMutate } from '@/lib/api';
import { useTypedSession } from '@/lib/auth-client';
import { queryKeys } from '@/lib/query-keys';
import { isAdmin } from '@/lib/utils';
import type { AdminCourse } from '@/types/api';

export const Route = createFileRoute('/_app/admin/')({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data: session } = useTypedSession();
  const role = session?.user?.role;
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.adminCourses,
    queryFn: () => apiFetch<{ courses: AdminCourse[] }>('/api/admin/courses'),
    enabled: isAdmin(role),
  });

  const activeCourses =
    data?.courses?.filter((c) => c.visibility !== 'archived') ?? [];
  const archivedCourses =
    data?.courses?.filter((c) => c.visibility === 'archived') ?? [];

  const [showArchived, setShowArchived] = useState(false);

  const restoreMutation = useMutation({
    mutationFn: (courseId: string) =>
      apiMutate(`/api/admin/courses/${courseId}`, {
        method: 'PATCH',
        body: { visibility: 'private' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminCourses });
      queryClient.invalidateQueries({ queryKey: queryKeys.courses });
      toast.success('Course restored');
    },
    onError: () => {
      toast.error('Failed to restore course. Please try again.');
    },
  });

  usePageTitle('Admin');

  if (!isAdmin(role)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">You do not have admin access.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage courses, scenarios, and personas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/personas">
              <Users className="mr-2 h-4 w-4" />
              Personas
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/access-codes">
              <KeyRound className="mr-2 h-4 w-4" />
              Access Codes
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/users">
              <Users className="mr-2 h-4 w-4" />
              Users
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {/* Active Courses */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Courses</h2>
          <Button size="sm" asChild>
            <Link to="/admin/courses/new">
              <Plus className="mr-2 h-4 w-4" />
              New Course
            </Link>
          </Button>
        </div>

        {isPending ? (
          <div className="mt-6 flex justify-center">
            <Spinner className="size-8" />
          </div>
        ) : activeCourses.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No courses yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Create your first course to get started.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {activeCourses.map((c) => (
              <Link
                key={c.id}
                to="/admin/courses/$courseId"
                params={{ courseId: c.id }}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.scenarioCount} scenario
                      {c.scenarioCount !== 1 ? 's' : ''} · {c.visibility}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {c.subject}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Archived Courses */}
      {archivedCourses.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive className="h-4 w-4" />
            Archived ({archivedCourses.length})
            <span className="text-xs">{showArchived ? '▼' : '▶'}</span>
          </button>

          {showArchived && (
            <div className="mt-3 space-y-3">
              {archivedCourses.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-muted p-2">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground">
                        {c.title}
                      </p>
                      <p className="text-xs text-muted-foreground/60">
                        {c.scenarioCount} scenario
                        {c.scenarioCount !== 1 ? 's' : ''} · {c.subject}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      restoreMutation.isPending &&
                      restoreMutation.variables === c.id
                    }
                    onClick={() => restoreMutation.mutate(c.id)}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
