import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { AdminFormActions } from '@/components/admin/AdminFormActions';
import { AdminFormShell } from '@/components/admin/AdminFormShell';
import { MutationErrorAlert } from '@/components/admin/MutationErrorAlert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch, apiMutate } from '@/lib/api';
import { useTypedSession } from '@/lib/auth-client';
import { queryKeys } from '@/lib/query-keys';
import { isAdmin } from '@/lib/utils';
import type { PersonaDetail } from '@/types/api';

export const Route = createFileRoute('/_app/admin/personas/$personaId')({
  component: PersonaEditor,
});

function PersonaEditor() {
  const { personaId } = Route.useParams();
  const { data: session } = useTypedSession();
  const role = session?.user?.role;
  const queryClient = useQueryClient();

  const { data: fetched, isPending: loading } = useQuery({
    queryKey: queryKeys.persona(personaId),
    queryFn: () =>
      apiFetch<{ persona: PersonaDetail }>(`/api/admin/personas/${personaId}`),
    enabled: isAdmin(role),
  });
  const data = fetched?.persona ?? null;

  const saveMutation = useMutation({
    mutationFn: (body: {
      name: string;
      description: string;
      systemPrompt: string;
    }) =>
      apiMutate(`/api/admin/personas/${personaId}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: queryKeys.persona(personaId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.personas });
    },
  });

  const [promptLength, setPromptLength] = useState<number | null>(null);

  usePageTitle('Edit Persona');

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    saveMutation.mutate({
      name: String(form.get('name') || ''),
      description: String(form.get('description') || ''),
      systemPrompt: String(form.get('systemPrompt') || ''),
    });
  }

  return (
    <AdminFormShell
      title="Edit Persona"
      backTo="/admin/personas"
      backLabel="Back to Personas"
      loading={loading}
      notFoundMessage="Persona not found"
      dataLoaded={!!data}
    >
      <form onSubmit={handleSave} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={data?.name ?? ''}
            required
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={data?.description ?? ''}
            required
            rows={2}
            className="mt-1"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <span className="text-xs text-muted-foreground">
              {(
                promptLength ??
                data?.systemPrompt.length ??
                0
              ).toLocaleString()}{' '}
              chars
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            The full raw system prompt sent to the AI model.
          </p>
          <Textarea
            id="systemPrompt"
            name="systemPrompt"
            defaultValue={data?.systemPrompt ?? ''}
            required
            rows={20}
            className="mt-1 font-mono text-sm"
            onChange={(e) => setPromptLength(e.target.value.length)}
          />
        </div>

        <MutationErrorAlert error={saveMutation.error} />

        <AdminFormActions
          isPending={saveMutation.isPending}
          pendingLabel="Saving..."
          submitLabel="Save Changes"
        />
      </form>
    </AdminFormShell>
  );
}
