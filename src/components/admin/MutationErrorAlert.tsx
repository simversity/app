import { Alert, AlertDescription } from '@/components/ui/alert';

export function MutationErrorAlert({
  error,
}: {
  error: Error | null | undefined;
}) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  );
}
