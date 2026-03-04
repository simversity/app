import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type StreamingStatusIndicatorProps = {
  status: string;
  loadingLabel: string;
  error: string | null;
  className?: string;
  spinnerClassName?: string;
  onRetry?: () => void;
  onDismissError?: () => void;
};

export function StreamingStatusIndicator({
  status,
  loadingLabel,
  error,
  className,
  spinnerClassName,
  onRetry,
  onDismissError,
}: StreamingStatusIndicatorProps) {
  return (
    <>
      {status === 'streaming' && (
        <div
          className={cn(
            'flex items-center gap-2 text-sm text-muted-foreground',
            className,
          )}
        >
          <Spinner className={spinnerClassName} />
          {loadingLabel}
        </div>
      )}
      {error && (
        <Alert variant="destructive" className={className}>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <span className="flex shrink-0 gap-2">
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  Retry
                </Button>
              )}
              {onDismissError && (
                <Button variant="ghost" size="sm" onClick={onDismissError}>
                  Dismiss
                </Button>
              )}
            </span>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
