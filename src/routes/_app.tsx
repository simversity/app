import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  redirect,
} from '@tanstack/react-router';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }
    if (session.user.emailVerified === false) {
      throw redirect({ to: '/verify-email' });
    }
  },
  pendingComponent: () => (
    <div className="flex h-dvh items-center justify-center bg-background">
      <Spinner className="size-8" />
    </div>
  ),
  component: AppLayout,
  errorComponent: AppErrorComponent,
});

function AppErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <div
      role="alert"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {error instanceof Error
          ? error.message
          : 'An unexpected error occurred.'}
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link to="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
