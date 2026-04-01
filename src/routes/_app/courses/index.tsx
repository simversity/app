import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { BookOpen, Plus, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Course } from '@/types/api';

type CourseWithMeta = Course & { visibility?: string; createdBy?: string };
type ProgressRecord = { courseId: string; status: string };

export const Route = createFileRoute('/_app/courses/')({
  component: CourseCatalog,
});

function CourseCatalog() {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.courses,
    queryFn: () => apiFetch<{ courses: CourseWithMeta[] }>('/api/courses'),
  });
  const { data: progressData } = useQuery({
    queryKey: queryKeys.progress,
    queryFn: () =>
      apiFetch<{ progress: ProgressRecord[] }>('/api/progress?limit=200'),
  });

  const [search, setSearch] = useState('');

  const allCourses = data?.courses ?? [];
  const filtered = allCourses.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.subject.toLowerCase().includes(q)
    );
  });
  const myCourses = filtered.filter((c) => c.visibility === 'private');
  const publishedCourses = filtered.filter((c) => c.visibility !== 'private');

  const courseProgress = useMemo(() => {
    const map = new Map<string, { completed: number; total: number }>();
    for (const p of progressData?.progress ?? []) {
      const entry = map.get(p.courseId) ?? { completed: 0, total: 0 };
      entry.total++;
      if (p.status === 'completed') entry.completed++;
      map.set(p.courseId, entry);
    }
    return map;
  }, [progressData]);

  usePageTitle('Courses');

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Courses</h1>
          <p className="mt-2 text-muted-foreground">
            Practice responding to common student misconceptions
          </p>
        </div>
        <Button asChild>
          <Link to="/create-scenario">
            <Plus className="h-4 w-4" />
            Create Scenario
          </Link>
        </Button>
      </div>

      {!isPending && !error && allCourses.length > 0 && (
        <div className="relative mt-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {isPending ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-6"
            >
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-3/4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
                  <div className="mt-3 flex gap-2">
                    <div className="h-5 w-16 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
                    <div className="h-5 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="mt-8 rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{error.message}</p>
        </div>
      ) : search && myCourses.length === 0 && publishedCourses.length === 0 ? (
        <div className="mt-8 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No courses match &ldquo;{search}&rdquo;
          </p>
        </div>
      ) : (
        <>
          {myCourses.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">My Scenarios</h2>
              </div>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                {myCourses.map((c) => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    isPrivate
                    progress={courseProgress.get(c.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {publishedCourses.length > 0 ? (
            <div className="mt-8">
              {myCourses.length > 0 && (
                <h2 className="mb-4 text-lg font-semibold">
                  Published Courses
                </h2>
              )}
              <div className="grid gap-6 sm:grid-cols-2">
                {publishedCourses.map((c) => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    progress={courseProgress.get(c.id)}
                  />
                ))}
              </div>
            </div>
          ) : myCourses.length === 0 ? (
            <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground/40" />
              <p className="mt-4 text-sm font-medium">
                No courses available yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                No courses are published yet.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link to="/create-scenario">
                  <Plus className="h-4 w-4" />
                  Create your own scenario
                </Link>
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function CourseCard({
  course: c,
  isPrivate,
  progress,
}: {
  course: CourseWithMeta;
  isPrivate?: boolean;
  progress?: { completed: number; total: number };
}) {
  return (
    <Link
      to="/courses/$courseId"
      params={{ courseId: c.id }}
      className="group rounded-lg border border-border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-primary/10 p-2.5">
          {isPrivate ? (
            <Sparkles className="h-5 w-5 text-primary" />
          ) : (
            <BookOpen className="h-5 w-5 text-primary" />
          )}
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
            {progress && progress.completed > 0 && (
              <span className="text-primary font-medium">
                {progress.completed}/{c.scenarioCount} completed
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
