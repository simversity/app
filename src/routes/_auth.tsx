import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/_auth')({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    if (!session) return;
    if (session.user.emailVerified === false) {
      if (location.pathname !== '/verify-email') {
        throw redirect({ to: '/verify-email' });
      }
      return;
    }
    throw redirect({ to: '/dashboard' });
  },
  component: () => <Outlet />,
});
