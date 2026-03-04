import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Plus, Trash2, UserCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Spinner } from '@/components/ui/spinner';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch, apiMutate } from '@/lib/api';
import { useTypedSession } from '@/lib/auth-client';
import { queryKeys } from '@/lib/query-keys';
import { isAdmin } from '@/lib/utils';

type Persona = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
};

export const Route = createFileRoute('/_app/admin/personas/')({
  component: PersonaList,
});

function PersonaList() {
  const { data: session } = useTypedSession();
  const role = session?.user?.role;
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.personas,
    queryFn: () => apiFetch<{ personas: Persona[] }>('/api/admin/personas'),
    enabled: isAdmin(role),
  });
  const personas = data?.personas ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiMutate(`/api/admin/personas/${id}`, { method: 'DELETE' }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: queryKeys.personas });
    },
  });

  usePageTitle('Personas');

  return (
    <div className="mx-auto max-w-3xl p-8">
      <Link
        to="/admin"
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Personas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable student persona templates
          </p>
        </div>
        <Button size="sm" asChild>
          <Link to="/admin/personas/new">
            <Plus className="mr-2 h-4 w-4" />
            New Persona
          </Link>
        </Button>
      </div>

      {(error || deleteMutation.error) && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>
            {error?.message || deleteMutation.error?.message}
          </AlertDescription>
        </Alert>
      )}

      {isPending ? (
        <div className="mt-8 flex justify-center">
          <Spinner className="size-8" />
        </div>
      ) : personas.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-8 text-center">
          <UserCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No personas yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Create your first student persona to use in scenarios.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {personas.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <Link
                to="/admin/personas/$personaId"
                params={{ personaId: p.id }}
                className="flex-1"
              >
                <p className="font-medium hover:text-primary transition-colors">
                  {p.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                  {p.description}
                </p>
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${p.name}`}
                    className="ml-4 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete persona</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete &ldquo;{p.name}&rdquo;?
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => deleteMutation.mutate(p.id)}
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
  );
}
