import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({});

export const { signIn, signUp, signOut, useSession } = authClient;

/** Convenience type for the authenticated user (includes custom fields) */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string;
  image?: string | null;
};

/** Typed wrapper around useSession that casts user to SessionUser */
export function useTypedSession() {
  const session = useSession();
  return {
    ...session,
    data: session.data
      ? { ...session.data, user: session.data.user as unknown as SessionUser }
      : null,
  };
}
