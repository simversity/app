import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Calendar, Check, GraduationCap, Mail, Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiFetch, apiMutate } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { queryKeys } from '@/lib/query-keys';
import type { ProfileData } from '@/types/api';

export const Route = createFileRoute('/_app/profile')({
  component: Profile,
});

function Profile() {
  const { data: session } = useSession();
  const sessionUser = session?.user;
  const queryClient = useQueryClient();
  const { data: profileData, error: loadError } = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<{ profile: ProfileData }>('/api/user/profile'),
  });
  const profile = profileData?.profile ?? null;
  const [editing, setEditing] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (body: {
      name: string;
      gradeLevel: string | null;
      subjects: string | null;
      experienceYears: number | null;
    }) => apiMutate('/api/user/profile', { method: 'PATCH', body }),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      setEditing(false);
      toast.success('Profile updated');
    },
  });

  usePageTitle('Profile');

  const user = profile || sessionUser;

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    saveMutation.mutate({
      name: String(form.get('name') || ''),
      gradeLevel: String(form.get('gradeLevel') || '') || null,
      subjects: String(form.get('subjects') || '') || null,
      experienceYears: form.get('experienceYears')
        ? Number(form.get('experienceYears'))
        : null,
    });
  }

  const userRole = profile?.role;
  const role =
    userRole === 'admin' || userRole === 'super_admin' ? 'Admin' : 'Instructor';

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your teaching profile information
          </p>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </div>

      {loadError && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{loadError.message}</AlertDescription>
        </Alert>
      )}

      {editing ? (
        <form onSubmit={handleSave} className="mt-8 space-y-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={user?.name || ''}
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="gradeLevel">Grade Level</Label>
                <Input
                  id="gradeLevel"
                  name="gradeLevel"
                  defaultValue={profile?.gradeLevel || ''}
                  placeholder="e.g. University, High School"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="subjects">Subjects</Label>
                <Input
                  id="subjects"
                  name="subjects"
                  defaultValue={profile?.subjects || ''}
                  placeholder="e.g. Biology, Chemistry"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="experienceYears">Years of Experience</Label>
                <Input
                  id="experienceYears"
                  name="experienceYears"
                  type="number"
                  min={0}
                  defaultValue={profile?.experienceYears ?? ''}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {saveMutation.error && (
            <Alert variant="destructive">
              <AlertDescription>{saveMutation.error.message}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                'Saving...'
              ) : (
                <>
                  <Check className="mr-2 h-3.5 w-3.5" />
                  Save
                </>
              )}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-8 rounded-lg border border-border bg-card">
          {/* Avatar + Name */}
          <div className="flex items-center gap-4 border-b border-border p-6">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground"
              role="img"
              aria-label={`Avatar for ${user?.name || 'user'}`}
            >
              {user?.name
                ?.split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2) || '?'}
            </div>
            <div>
              <p className="text-lg font-semibold">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{role}</p>
            </div>
          </div>

          {/* Details */}
          <div className="divide-y divide-border">
            <ProfileRow icon={Mail} label="Email" value={user?.email || '—'} />
            <ProfileRow
              icon={GraduationCap}
              label="Grade Level"
              value={profile?.gradeLevel || '—'}
            />
            <ProfileRow
              icon={GraduationCap}
              label="Subjects"
              value={profile?.subjects || '—'}
            />
            <ProfileRow
              icon={GraduationCap}
              label="Experience"
              value={
                profile?.experienceYears != null
                  ? `${profile.experienceYears} year${profile.experienceYears !== 1 ? 's' : ''}`
                  : '—'
              }
            />
            <ProfileRow
              icon={Calendar}
              label="Member since"
              value={
                profile?.createdAt
                  ? new Date(profile.createdAt).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })
                  : '—'
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-6 py-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="w-28 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
