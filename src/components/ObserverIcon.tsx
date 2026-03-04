import { Eye } from 'lucide-react';

type ObserverIconProps = {
  size?: 'sm' | 'lg';
};

const sizeClasses = {
  sm: { container: 'h-7 w-7', icon: 'h-3.5 w-3.5' },
  lg: { container: 'h-10 w-10', icon: 'h-5 w-5' },
} as const;

export function ObserverIcon({ size = 'sm' }: ObserverIconProps) {
  const s = sizeClasses[size];
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-observer/10 text-observer-foreground ${s.container}`}
    >
      <Eye className={s.icon} />
    </div>
  );
}
