import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AdminFormActions } from '@/components/admin/AdminFormActions';
import { AdminFormShell } from '@/components/admin/AdminFormShell';
import { MutationErrorAlert } from '@/components/admin/MutationErrorAlert';
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
import { apiMutate } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export const Route = createFileRoute('/_app/admin/courses/new')({
  component: NewCourse,
});

function NewCourse() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiMutate<{ course: { id: string } }>('/api/admin/courses', { body }),
    onSuccess(data) {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminCourses });
      navigate({
        to: '/admin/courses/$courseId',
        params: { courseId: data.course.id },
      });
    },
  });

  usePageTitle('New Course');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      title: String(form.get('title') || ''),
      description: String(form.get('description') || ''),
      gradeLevel: String(form.get('gradeLevel') || ''),
      subject: String(form.get('subject') || ''),
      visibility: String(form.get('visibility') || 'private'),
    });
  }

  return (
    <AdminFormShell
      title="New Course"
      backTo="/admin"
      backLabel="Back to Admin"
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
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
              required
              placeholder="e.g. University"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              name="subject"
              required
              placeholder="e.g. Biology"
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="visibility">Visibility</Label>
          <Select name="visibility" defaultValue="private">
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

        <MutationErrorAlert error={createMutation.error} />

        <AdminFormActions
          isPending={createMutation.isPending}
          pendingLabel="Creating..."
          submitLabel="Create Course"
          onCancel={() => navigate({ to: '/admin' })}
        />
      </form>
    </AdminFormShell>
  );
}
