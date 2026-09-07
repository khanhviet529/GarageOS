import { cn } from '@/lib/utils';

/* 🔒 `animate-pulse` bị `prefers-reduced-motion` trong globals.css tắt hẳn. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('animate-pulse rounded-sm bg-ink-2', className)} aria-hidden="true" {...props} />;
}
