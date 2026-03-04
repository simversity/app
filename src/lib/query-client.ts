import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { getUserFriendlyMessage } from '@/lib/error-messages';
import { router } from '@/lib/router';

/**
 * Returns true if the error was already handled (toasted or redirected)
 * so callers can skip duplicate messaging.
 */
function handleGlobalError(error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      router.navigate({ to: '/login' });
      return true;
    }
    if (error.status === 403) {
      toast.error('Access denied');
      return true;
    }
    if (error.status === 429) {
      toast.error(getUserFriendlyMessage(error));
      return true;
    }
  }
  return false;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry(failureCount, error) {
        if (
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        ) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
  queryCache: new QueryCache({
    onError: handleGlobalError,
  }),
  mutationCache: new MutationCache({
    onError(error) {
      if (handleGlobalError(error)) return;
      toast.error(getUserFriendlyMessage(error));
    },
  }),
});
