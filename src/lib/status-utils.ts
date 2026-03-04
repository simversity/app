/** Map conversation status to shadcn Badge variant. */
export function getStatusVariant(
  status: string,
): 'success' | 'destructive' | 'secondary' {
  if (status === 'completed') return 'success';
  if (status === 'abandoned') return 'destructive';
  return 'secondary';
}

/** Capitalize a status string for display. */
export function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
