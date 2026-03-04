import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch, apiMutate } from '@/lib/api';
import { useTypedSession } from '@/lib/auth-client';
import { queryKeys } from '@/lib/query-keys';
import { isAdmin } from '@/lib/utils';

type AccessCode = {
  id: string;
  code: string;
  role: string;
  usedBy: string | null;
  usedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export const Route = createFileRoute('/_app/admin/access-codes')({
  component: AccessCodeManagement,
});

function AccessCodeManagement() {
  const { data: session } = useTypedSession();
  const role = session?.user?.role;
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.accessCodes,
    queryFn: () => apiFetch<{ codes: AccessCode[] }>('/api/admin/access-codes'),
    enabled: isAdmin(role),
  });
  const codes = data?.codes ?? [];

  const [newRole, setNewRole] = useState<string>('teacher');
  const [revealedCode, setRevealedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: (role: string) =>
      apiMutate<{ code: string }>('/api/admin/access-codes', {
        method: 'POST',
        body: { role },
      }),
    onSuccess(result) {
      setRevealedCode(result.code);
      setCopied(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.accessCodes });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiMutate(`/api/admin/access-codes/${id}`, { method: 'DELETE' }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: queryKeys.accessCodes });
    },
  });

  usePageTitle('Access Codes');

  function handleCopyCode() {
    if (!revealedCode) return;
    navigator.clipboard
      .writeText(revealedCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        toast.error('Could not copy to clipboard');
      });
  }

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
          <h1 className="text-2xl font-bold">Access Codes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate invite codes for new users
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="teacher">Teacher</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => createMutation.mutate(newRole)}
            disabled={createMutation.isPending}
          >
            <Plus className="mr-2 h-4 w-4" />
            {createMutation.isPending ? 'Creating...' : 'New Code'}
          </Button>
        </div>
      </div>

      {(error || createMutation.error || deleteMutation.error) && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>
            {error?.message ||
              createMutation.error?.message ||
              deleteMutation.error?.message}
          </AlertDescription>
        </Alert>
      )}

      {isPending ? (
        <div className="mt-8 flex justify-center">
          <Spinner className="size-8" />
        </div>
      ) : codes.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-8 text-center">
          <KeyRound className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            No access codes yet
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {codes.map((c) => {
            const isUsed = !!c.usedBy;
            const isExpired =
              !!c.expiresAt && new Date(c.expiresAt) < new Date();
            return (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-mono text-sm font-medium">{c.code}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-secondary px-1.5 py-0.5 font-medium">
                        {c.role}
                      </span>
                      {isUsed ? (
                        <span className="text-green-600">Used</span>
                      ) : isExpired ? (
                        <span className="text-destructive">Expired</span>
                      ) : (
                        <span>Available</span>
                      )}
                      <span>
                        Created {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                {!isUsed && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete code ${c.code}`}
                        className="ml-4 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete access code</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this access code? This
                          action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => deleteMutation.mutate(c.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reveal newly created code */}
      <AlertDialog
        open={!!revealedCode}
        onOpenChange={(open) => {
          if (!open) setRevealedCode(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Access code created</AlertDialogTitle>
            <AlertDialogDescription>
              Copy this code now. You will not be able to see it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-4 py-3">
            <code className="flex-1 text-lg font-mono font-semibold tracking-wider">
              {revealedCode}
            </code>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopyCode}
              aria-label="Copy code"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setRevealedCode(null)}>
              Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
