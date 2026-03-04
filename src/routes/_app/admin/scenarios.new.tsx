import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AgentListEditor, useAgentList } from '@/components/AgentListEditor';
import { AdminFormActions } from '@/components/admin/AdminFormActions';
import { AdminFormShell } from '@/components/admin/AdminFormShell';
import { MutationErrorAlert } from '@/components/admin/MutationErrorAlert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch, apiMutate } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Persona } from '@/types/api';

export const Route = createFileRoute('/_app/admin/scenarios/new')({
  component: NewScenario,
  validateSearch: (search: Record<string, unknown>) => ({
    courseId: (search.courseId as string) || '',
  }),
});

function NewScenario() {
  const { courseId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: personaData, error: personaError } = useQuery({
    queryKey: queryKeys.personas,
    queryFn: () => apiFetch<{ personas: Persona[] }>('/api/admin/personas'),
  });
  const personas = personaData?.personas ?? [];
  const { agents, addAgent, removeAgent, updateAgent } = useAgentList();

  const createMutation = useMutation({
    mutationFn: (body: unknown) =>
      apiMutate(`/api/admin/courses/${courseId}/scenarios`, { body }),
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: queryKeys.courseScenarios(courseId),
      });
      navigate({ to: '/admin/courses/$courseId', params: { courseId } });
    },
  });

  usePageTitle('New Scenario');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      title: String(form.get('title') || ''),
      description: String(form.get('description') || ''),
      observerPrompt: String(form.get('observerPrompt') || '') || undefined,
      activityContext: String(form.get('activityContext') || '') || undefined,
      agents: agents
        .filter((a) => a.personaId)
        .map((a, i) => ({
          personaId: a.personaId,
          openingMessage: a.openingMessage || undefined,
          sortOrder: i,
          maxResponseTokens: a.maxResponseTokens || null,
        })),
    });
  }

  return (
    <AdminFormShell
      title="New Scenario"
      backTo="/admin/courses/$courseId"
      backLabel="Back to course"
      backParams={{ courseId }}
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
            rows={2}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="activityContext">Activity Context</Label>
          <Textarea
            id="activityContext"
            name="activityContext"
            rows={2}
            className="mt-1"
            placeholder="Brief description of the learning activity..."
          />
        </div>
        <div>
          <Label htmlFor="observerPrompt">Observer Prompt</Label>
          <p className="text-xs text-muted-foreground">
            Custom observer system prompt. Leave empty for default.
          </p>
          <Textarea
            id="observerPrompt"
            name="observerPrompt"
            rows={6}
            className="mt-1 font-mono text-sm"
            placeholder="You are an expert pedagogical observer..."
          />
        </div>

        <AgentListEditor
          agents={agents}
          personas={personas}
          onAdd={() => addAgent(personas)}
          onRemove={removeAgent}
          onUpdate={updateAgent}
          emptyMessage="No personas assigned. Add at least one student persona."
        />

        <MutationErrorAlert error={createMutation.error || personaError} />

        <AdminFormActions
          isPending={createMutation.isPending}
          pendingLabel="Creating..."
          submitLabel="Create Scenario"
          disabled={
            !agents.some((a) => a.personaId && a.openingMessage?.trim())
          }
          onCancel={() =>
            navigate({ to: '/admin/courses/$courseId', params: { courseId } })
          }
        />
      </form>
    </AdminFormShell>
  );
}
