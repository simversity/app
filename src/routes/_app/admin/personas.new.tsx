import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AdminFormActions } from '@/components/admin/AdminFormActions';
import { AdminFormShell } from '@/components/admin/AdminFormShell';
import { MutationErrorAlert } from '@/components/admin/MutationErrorAlert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiMutate } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export const Route = createFileRoute('/_app/admin/personas/new')({
  component: NewPersona,
});

function NewPersona() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (body: {
      name: string;
      description: string;
      systemPrompt: string;
    }) =>
      apiMutate<{ persona: { id: string } }>('/api/admin/personas', { body }),
    onSuccess(data) {
      queryClient.invalidateQueries({ queryKey: queryKeys.personas });
      navigate({
        to: '/admin/personas/$personaId',
        params: { personaId: data.persona.id },
      });
    },
  });

  usePageTitle('New Persona');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    createMutation.mutate({
      name: String(form.get('name') || ''),
      description: String(form.get('description') || ''),
      systemPrompt: String(form.get('systemPrompt') || ''),
    });
  }

  return (
    <AdminFormShell
      title="New Persona"
      backTo="/admin/personas"
      backLabel="Back to Personas"
      subtitle="Create a reusable student persona template"
    >
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            placeholder="e.g. Riley"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <p className="text-xs text-muted-foreground">
            Admin-facing summary of this persona
          </p>
          <Textarea
            id="description"
            name="description"
            required
            rows={2}
            className="mt-1"
            placeholder="A curious 7th-grader who thinks..."
          />
        </div>
        <div>
          <Label htmlFor="systemPrompt">System Prompt</Label>
          <p className="text-xs text-muted-foreground">
            The full raw system prompt. This is sent directly to the AI model.
          </p>
          <Textarea
            id="systemPrompt"
            name="systemPrompt"
            required
            rows={16}
            className="mt-1 font-mono text-sm"
            placeholder="You are a student named Riley..."
          />
        </div>

        <MutationErrorAlert error={createMutation.error} />

        <AdminFormActions
          isPending={createMutation.isPending}
          pendingLabel="Creating..."
          submitLabel="Create Persona"
          onCancel={() => navigate({ to: '/admin/personas' })}
        />
      </form>
    </AdminFormShell>
  );
}
