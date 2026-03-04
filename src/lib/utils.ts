import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ADMIN_ROLES: ReadonlySet<string> = new Set(['admin', 'super_admin']);

export function isAdmin(role?: string | null): boolean {
  return !!role && ADMIN_ROLES.has(role);
}
