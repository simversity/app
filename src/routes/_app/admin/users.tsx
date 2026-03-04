import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Shield, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import type { UserEntry, UserRole } from '@/types/api';

export const Route = createFileRoute('/_app/admin/users')({
  component: UserManagement,
});

function UserManagement() {
  const { data: session } = useTypedSession();
  const myRole = session?.user?.role;
  const myId = session?.user?.id;
  const queryClient = useQueryClient();

  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.users,
    queryFn: () => apiFetch<{ users: UserEntry[] }>('/api/admin/users'),
    enabled: isAdmin(myRole),
  });
  const users = data?.users ?? [];

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) =>
      apiMutate(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: { role },
      }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
    },
  });

  usePageTitle('Users');

  if (myRole !== 'super_admin' && myRole !== 'admin') {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Access denied.</p>
      </div>
    );
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

      <h1 className="text-2xl font-bold">User Management</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage user roles and permissions
      </p>

      {(error || roleMutation.error) && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>
            {error?.message || roleMutation.error?.message}
          </AlertDescription>
        </Alert>
      )}

      {isPending ? (
        <div className="mt-8 flex justify-center">
          <Spinner className="size-8" />
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {u.name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2) || '?'}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {u.name} {u.id === myId && '(you)'}
                  </p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {u.role === 'super_admin' ? (
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    <ShieldCheck className="h-3 w-3" />
                    Super Admin
                  </span>
                ) : u.id === myId ? (
                  <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                    <Shield className="h-3 w-3" />
                    {u.role === 'admin' ? 'Admin' : 'Teacher'}
                  </span>
                ) : (
                  <Select
                    value={u.role}
                    onValueChange={(v) =>
                      roleMutation.mutate({
                        userId: u.id,
                        role: v as UserRole,
                      })
                    }
                  >
                    <SelectTrigger size="sm" aria-label={`Role for ${u.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teacher">Teacher</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
