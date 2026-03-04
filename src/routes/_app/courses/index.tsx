import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { BookOpen } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Course } from '@/types/api';

export const Route = createFileRoute('/_app/courses/')({
  component: CourseCatalog,
});

function CourseCatalog() {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.courses,
    queryFn: () => apiFetch<{ courses: Course[] }>('/api/courses'),
  });
  const courses = data?.courses ?? [];

  usePageTitle('Courses');

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-3xl font-bold">Courses</h1>
      <p className="mt-2 text-muted-foreground">
        Practice responding to common student misconceptions
      </p>

      {isPending ? (
        <div className="mt-8 flex justify-center">
          <Spinner className="size-8" />
        </div>
      ) : error ? (
        <div className="mt-8 rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{error.message}</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-4 text-sm font-medium">No courses available yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No courses are published yet.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {courses.map((c) => (
            <Link
              key={c.id}
              to="/courses/$courseId"
              params={{ courseId: c.id }}
              className="group rounded-lg border border-border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-primary/10 p-2.5">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold group-hover:text-primary transition-colors">
                    {c.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {c.description}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 font-medium">
                      {c.subject}
                    </span>
                    <span>{c.scenarioCount} scenarios</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
