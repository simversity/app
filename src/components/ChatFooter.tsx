import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ChatFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('border-t border-border px-4 py-3', className)}>
      {children}
    </div>
  );
}
