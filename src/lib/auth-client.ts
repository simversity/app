import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: 'string', required: false, defaultValue: 'teacher' },
        subjects: { type: 'string', required: false },
        experienceYears: { type: 'number', required: false },
      },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;

/**
 * Typed wrapper around useSession for consumers that need the `role` field.
 * The inferAdditionalFields plugin makes role/subjects/experienceYears
 * available on session.data.user without casting.
 */
export function useTypedSession() {
  return useSession();
}
