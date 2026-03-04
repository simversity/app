import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export function AdminFormActions({
  isPending,
  pendingLabel,
  submitLabel,
  disabled,
  onCancel,
  leftContent,
  extraRight,
}: {
  isPending: boolean;
  pendingLabel: string;
  submitLabel: string;
  disabled?: boolean;
  onCancel?: () => void;
  leftContent?: ReactNode;
  extraRight?: ReactNode;
}) {
  return (
    <div className={`flex ${leftContent ? 'justify-between' : 'justify-end'}`}>
      {leftContent}
      <div className="flex items-center gap-2">
        {extraRight}
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending || disabled}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </div>
  );
}
