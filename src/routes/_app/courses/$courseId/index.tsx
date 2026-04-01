import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  CheckCircle,
  Clock,
  MessageCircle,
  Pencil,
  PlayCircle,
  User,
  Users,
} from 'lucide-react';
import { useMemo } from 'react';
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
import { Card, CardContent } from '@/components/ui/card';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { CourseDetail } from '@/types/api';

type ProgressRecord = {
  scenarioId: string;
  courseId: string;
  status: string;
};

type ConversationListItem = {
  scenarioId: string;
  status: string;
};

export const Route = createFileRoute('/_app/courses/$courseId/')({
  component: CourseOverview,
});

function CourseOverview() {
  const { courseId } = Route.useParams();
  const {
    data: course,
    isPending,
    error,
  } = useQuery({
    queryKey: queryKeys.course(courseId),
    queryFn: () => apiFetch<CourseDetail>(`/api/courses/${courseId}`),
  });

  // Fetch active conversations for resume detection
  const { data: activeConvs } = useQuery({
    queryKey: queryKeys.conversationList({ status: 'active' }),
    queryFn: () =>
      apiFetch<{ conversations: ConversationListItem[] }>(
        '/api/conversations?status=active&limit=50',
      ),
  });

  // Fetch progress for per-scenario status
  const { data: progressData } = useQuery({
    queryKey: queryKeys.progress,
    queryFn: () =>
      apiFetch<{ progress: ProgressRecord[] }>('/api/progress?limit=200'),
  });

  const activeScenarios = useMemo(() => {
    const set = new Set<string>();
    for (const c of activeConvs?.conversations ?? []) {
      if (c.status === 'active') set.add(c.scenarioId);
    }
    return set;
  }, [activeConvs]);

  const scenarioProgress = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of progressData?.progress ?? []) {
      if (p.courseId === courseId) {
        map.set(p.scenarioId, p.status);
      }
    }
    return map;
  }, [progressData, courseId]);

  usePageTitle(course?.title ?? 'Course');

  if (isPending) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <div className="h-4 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-6 space-y-3">
          <div className="h-6 w-20 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
          <div className="h-8 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-4 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
        <div className="mt-8 space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-border p-6 space-y-3"
            >
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
                <div className="h-5 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              </div>
              <div className="h-4 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div className="h-16 animate-pulse rounded-md bg-muted/50 motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <p className="text-muted-foreground">Course not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/courses">Courses</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{course.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6">
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{course.subject}</Badge>
        </div>
        <h1 className="mt-3 text-3xl font-bold">{course.title}</h1>
        <p className="mt-2 text-muted-foreground">{course.description}</p>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold">Scenarios</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each scenario simulates a student with a specific misconception.
          Practice your response.
        </p>

        <div className="mt-6 space-y-4">
          {course.scenarios.map((s, i) => {
            const studentNames = s.studentName.split(', ');
            const isGroup = studentNames.length > 1;
            const isActive = activeScenarios.has(s.id);
            const progressStatus = scenarioProgress.get(s.id);
            return (
              <Card key={s.id} className="gap-0 py-0">
                <CardContent className="py-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge className="h-6 w-6 justify-center rounded-full p-0">
                          {i + 1}
                        </Badge>
                        <h3 className="text-lg font-semibold">{s.title}</h3>
                        {progressStatus === 'completed' && (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Completed
                          </Badge>
                        )}
                        {progressStatus === 'in_progress' && (
                          <Badge
                            variant="outline"
                            className="gap-1 text-yellow-600"
                          >
                            <Clock className="h-3 w-3" />
                            In Progress
                          </Badge>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {s.description}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="gap-1 text-student">
                          {isGroup ? (
                            <Users className="h-3 w-3" />
                          ) : (
                            <User className="h-3 w-3" />
                          )}
                          {isGroup
                            ? `Group (${studentNames.length} students)`
                            : s.studentName}
                        </Badge>
                        {isGroup && (
                          <span className="text-xs text-muted-foreground">
                            {studentNames.join(' & ')}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 rounded-md bg-muted/50 p-3">
                        <p className="text-sm italic text-muted-foreground">
                          &ldquo;{s.openingMessage}&rdquo;
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button asChild>
                      <Link
                        to="/courses/$courseId/conversation/$scenarioId"
                        params={{ courseId: course.id, scenarioId: s.id }}
                      >
                        {isActive ? (
                          <>
                            <PlayCircle className="h-4 w-4" />
                            Resume conversation
                          </>
                        ) : (
                          <>
                            <MessageCircle className="h-4 w-4" />
                            Start conversation
                          </>
                        )}
                      </Link>
                    </Button>
                    {course.visibility === 'private' && (
                      <Button variant="outline" asChild>
                        <Link
                          to="/courses/$courseId/scenarios/$scenarioId/edit"
                          params={{ courseId: course.id, scenarioId: s.id }}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
