import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiFetch } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

type BudgetStatus = {
  used: number;
  limit: number;
  remaining: number;
  enabled: boolean;
};

export function DailyBudgetWarning() {
  const { data, isError } = useQuery({
    queryKey: queryKeys.budgetStatus,
    queryFn: () => apiFetch<BudgetStatus>('/api/budget'),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (isError) {
    return (
      <div className="mx-auto mb-2 max-w-2xl rounded-lg border border-muted px-4 py-2 text-xs text-muted-foreground">
        Unable to load budget status.
      </div>
    );
  }

  if (!data?.enabled) return null;

  const pctUsed = data.limit > 0 ? data.used / data.limit : 0;

  if (data.remaining === 0) {
    return (
      <Alert variant="destructive" className="mx-auto mb-2 max-w-2xl">
        <AlertDescription>
          You&apos;ve reached your daily message limit. Your progress is saved
          &mdash; come back tomorrow to continue.
        </AlertDescription>
      </Alert>
    );
  }

  if (pctUsed >= 0.8) {
    return (
      <div className="mx-auto mb-2 max-w-2xl rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-2.5 text-sm text-muted-foreground">
        You&apos;ve used {data.used} of {data.limit} daily messages.{' '}
        {data.remaining} remaining.
      </div>
    );
  }

  return null;
}
