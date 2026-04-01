import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Archive, Check, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { AdminFormActions } from '@/components/admin/AdminFormActions';
import { AdminFormShell } from '@/components/admin/AdminFormShell';
import { MutationErrorAlert } from '@/components/admin/MutationErrorAlert';
import { FileManager } from '@/components/FileManager';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch, apiMutate } from '@/lib/api';
import { useTypedSession } from '@/lib/auth-client';
import { queryKeys } from '@/lib/query-keys';
import { isAdmin } from '@/lib/utils';
import type { CourseEditorCourse, CourseEditorScenario } from '@/types/api';

export const Route = createFileRoute('/_app/admin/courses/$courseId')({
  component: CourseEditor,
});

function CourseEditor() {
  const { courseId } = Route.useParams();
  const { data: session } = useTypedSession();
  const role = session?.user?.role;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: courseData,
    isPending: courseLoading,
    error: courseError,
  } = useQuery({
    queryKey: queryKeys.adminCourse(courseId),
    queryFn: () =>
      apiFetch<{ course: CourseEditorCourse }>(
        `/api/admin/courses/${courseId}`,
      ),
    enabled: isAdmin(role),
  });
  const { data: scenarioData, isPending: scenarioLoading } = useQuery({
    queryKey: queryKeys.courseScenarios(courseId),
    queryFn: () =>
      apiFetch<{ scenarios: CourseEditorScenario[] }>(
        `/api/admin/courses/${courseId}/scenarios`,
      ),
    enabled: isAdmin(role),
  });

  const course = courseData?.course ?? null;
  const scenarios = scenarioData?.scenarios ?? [];
  const loading = courseLoading || scenarioLoading;
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiMutate<{ course: CourseEditorCourse }>(
        `/api/admin/courses/${courseId}`,
        {
          method: 'PATCH',
          body,
        },
      ),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: queryKeys.adminCourse(courseId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.adminCourses });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const deleteScenarioMutation = useMutation({
    mutationFn: (id: string) =>
      apiMutate(`/api/admin/scenarios/${id}`, { method: 'DELETE' }),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: queryKeys.courseScenarios(courseId),
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/admin/courses/${courseId}`, { method: 'DELETE' }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminCourses });
      navigate({ to: '/admin' });
    },
  });

  usePageTitle('Edit Course');

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!course) return;
    const form = new FormData(e.currentTarget);
    saveMutation.mutate({
      title: String(form.get('title') || ''),
      description: String(form.get('description') || ''),
      gradeLevel: String(form.get('gradeLevel') || ''),
      subject: String(form.get('subject') || ''),
      visibility: String(form.get('visibility') || 'private'),
    });
  }

  return (
    <AdminFormShell
      title="Edit Course"
      backTo="/admin"
      backLabel="Back to Admin"
      loading={loading}
      notFoundMessage="Course not found"
      dataLoaded={!!course}
    >
      <form onSubmit={handleSave} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={course?.title ?? ''}
            required
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={course?.description ?? ''}
            required
            rows={3}
            className="mt-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="gradeLevel">Grade Level</Label>
            <Input
              id="gradeLevel"
              name="gradeLevel"
              defaultValue={course?.gradeLevel ?? ''}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              name="subject"
              defaultValue={course?.subject ?? ''}
              required
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="visibility">Visibility</Label>
          <Select
            name="visibility"
            defaultValue={course?.visibility ?? 'private'}
          >
            <SelectTrigger className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="shared">Shared</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <MutationErrorAlert error={saveMutation.error || courseError} />

        <AdminFormActions
          isPending={saveMutation.isPending}
          pendingLabel="Saving..."
          submitLabel="Save Changes"
          leftContent={
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive Course
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive course</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to archive &ldquo;{course?.title}
                    &rdquo;? The course will be hidden but can be restored
                    later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => archiveMutation.mutate()}
                  >
                    Archive
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          }
          extraRight={
            saved ? (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <Check className="h-4 w-4" />
                Saved
              </span>
            ) : undefined
          }
        />
      </form>

      {/* Files */}
      <div className="mt-10 border-t border-border pt-8">
        <FileManager parentType="course" parentId={courseId} />
      </div>

      {/* Scenarios */}
      <div className="mt-10 border-t border-border pt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Scenarios</h2>
          <Button size="sm" asChild>
            <Link to="/admin/scenarios/new" search={{ courseId }}>
              <Plus className="mr-2 h-4 w-4" />
              New Scenario
            </Link>
          </Button>
        </div>

        {scenarios.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No scenarios yet</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {scenarios.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
              >
                <Link
                  to="/admin/scenarios/$scenarioId"
                  params={{ scenarioId: s.id }}
                  className="flex-1"
                >
                  <p className="font-medium hover:text-primary transition-colors">
                    {s.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                    {s.description}
                  </p>
                  {s.agents?.length > 0 && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {s.agents.map((a) => a.persona.name).join(', ')}
                    </div>
                  )}
                </Link>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${s.title}`}
                      className="ml-4 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete scenario</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete &ldquo;{s.title}&rdquo;?
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => deleteScenarioMutation.mutate(s.id)}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminFormShell>
  );
}
