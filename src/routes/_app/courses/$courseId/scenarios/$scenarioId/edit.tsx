import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch, apiMutate } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

type StudentData = {
  personaId: string;
  name: string;
  description: string;
  systemPrompt: string;
  openingMessage: string;
};

type ScenarioData = {
  scenarioId: string;
  courseId: string;
  scenarioTitle: string;
  scenarioDescription: string;
  subject: string;
  gradeLevel: string;
  activityContext: string | null;
  students: StudentData[];
};

export const Route = createFileRoute(
  '/_app/courses/$courseId/scenarios/$scenarioId/edit',
)({
  component: EditScenario,
});

function EditScenario() {
  const { courseId, scenarioId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: scenario,
    isPending,
    error: loadError,
  } = useQuery({
    queryKey: queryKeys.scenarioBuilder(scenarioId),
    queryFn: () =>
      apiFetch<ScenarioData>(`/api/scenario-builder/${scenarioId}`),
  });

  usePageTitle(scenario ? `Edit: ${scenario.scenarioTitle}` : 'Edit Scenario');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [students, setStudents] = useState<StudentData[]>([]);

  // Initialize form state once data loads
  if (scenario && !initialized) {
    setTitle(scenario.scenarioTitle);
    setDescription(scenario.scenarioDescription);
    setSubject(scenario.subject);
    setStudents(scenario.students);
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiMutate(`/api/scenario-builder/${scenarioId}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.courses });
      toast.success('Scenario updated');
      navigate({ to: '/courses/$courseId', params: { courseId } });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      scenarioTitle: title,
      scenarioDescription: description,
      subject,
      students: students.map((s) => ({
        personaId: s.personaId,
        name: s.name,
        description: s.description,
        systemPrompt: s.systemPrompt,
        openingMessage: s.openingMessage,
      })),
    });
  };

  if (isPending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <Alert variant="destructive">
          <AlertDescription>{loadError.message}</AlertDescription>
        </Alert>
        <Button variant="outline" asChild className="mt-4">
          <Link to="/courses/$courseId" params={{ courseId }}>
            Back to course
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link
        to="/courses/$courseId"
        params={{ courseId }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to course
      </Link>

      <h1 className="mt-6 text-2xl font-bold">Edit Scenario</h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={2}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="mt-1"
            />
          </div>
        </div>

        {students.map((student, i) => (
          <div
            key={student.personaId}
            className="rounded-lg border border-border bg-card p-6 space-y-4"
          >
            <h3 className="text-sm font-semibold">Student {i + 1}</h3>
            <div>
              <Label htmlFor={`name-${i}`}>Name</Label>
              <Input
                id={`name-${i}`}
                value={student.name}
                onChange={(e) => {
                  const updated = [...students];
                  updated[i] = { ...updated[i], name: e.target.value };
                  setStudents(updated);
                }}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor={`desc-${i}`}>Description</Label>
              <Textarea
                id={`desc-${i}`}
                value={student.description}
                onChange={(e) => {
                  const updated = [...students];
                  updated[i] = { ...updated[i], description: e.target.value };
                  setStudents(updated);
                }}
                required
                rows={2}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor={`opening-${i}`}>Opening Message</Label>
              <Textarea
                id={`opening-${i}`}
                value={student.openingMessage}
                onChange={(e) => {
                  const updated = [...students];
                  updated[i] = {
                    ...updated[i],
                    openingMessage: e.target.value,
                  };
                  setStudents(updated);
                }}
                required
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
        ))}

        {saveMutation.error && (
          <Alert variant="destructive">
            <AlertDescription>{saveMutation.error.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              navigate({ to: '/courses/$courseId', params: { courseId } })
            }
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
