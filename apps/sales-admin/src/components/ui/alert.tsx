import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const variants = cva('flex gap-3 rounded-md border px-4 py-3 text-[13px]', {
  variants: {
    tone: {
      info: 'border-line bg-ink-2 text-text-muted',
      ok: 'border-ok/25 bg-ok/8 text-ok',
      warn: 'border-warn/25 bg-warn/8 text-warn',
      danger: 'border-danger/25 bg-danger/8 text-danger',
    },
  },
  defaultVariants: { tone: 'info' },
});

export function Alert({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof variants>): React.ReactElement {
  return <div role="status" className={cn(variants({ tone }), className)} {...props} />;
}
