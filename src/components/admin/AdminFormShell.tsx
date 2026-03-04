import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Spinner } from '@/components/ui/spinner';

export function AdminFormShell({
  title,
  backTo,
  backLabel,
  backParams,
  loading,
  notFoundMessage,
  dataLoaded = true,
  maxWidth = 'max-w-3xl',
  subtitle,
  children,
}: {
  title: string;
  backTo: string;
  backLabel: string;
  backParams?: Record<string, string>;
  loading?: boolean;
  notFoundMessage?: string;
  dataLoaded?: boolean;
  maxWidth?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!dataLoaded) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {notFoundMessage || 'Not found'}
      </div>
    );
  }

  return (
    <div className={`mx-auto ${maxWidth} p-8`}>
      <Link
        to={backTo}
        params={backParams}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && (
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      )}

      {children}
    </div>
  );
}
