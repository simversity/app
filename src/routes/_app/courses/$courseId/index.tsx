import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, MessageCircle, User, Users } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { CourseDetail } from '@/types/api';

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

  usePageTitle(course?.title ?? 'Course');

  if (isPending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="size-8" />
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
      <Link
        to="/courses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to courses
      </Link>

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

                  <div className="mt-4">
                    <Button asChild>
                      <Link
                        to="/courses/$courseId/conversation/$scenarioId"
                        params={{ courseId: course.id, scenarioId: s.id }}
                      >
                        <MessageCircle className="h-4 w-4" />
                        Start conversation
                      </Link>
                    </Button>
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
