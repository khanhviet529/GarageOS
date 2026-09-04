import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * Chip trạng thái: chấm tròn + nhãn, nền là chính màu trạng thái ở 12%.
 *
 * 🔒 KHÔNG BAO GIỜ chỉ dùng màu để phân biệt trạng thái (WCAG 1.4.1). Chấm tròn
 *    là hình dạng thứ hai, và nhãn chữ là thứ ba — người không phân biệt được
 *    đỏ với xanh vẫn đọc được trạng thái.
 */
const variants = cva(
  'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium',
  {
    variants: {
      tone: {
        ok: 'bg-ok/12 text-ok',
        warn: 'bg-warn/12 text-warn',
        danger: 'bg-danger/12 text-danger',
        brand: 'bg-brand/12 text-brand',
        /* Trung tính nằm trên ink-2, không phải ink-3: `--text-muted` mới đạt
           4.5:1 ở đó, `--text-dim` thì không. */
        neutral: 'bg-ink-2 text-text-muted',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

const dotColor: Record<NonNullable<VariantProps<typeof variants>['tone']>, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  brand: 'bg-brand',
  neutral: 'bg-text-muted',
};

export function Badge({
  tone = 'neutral',
  dot = true,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof variants> & { dot?: boolean }): React.ReactElement {
  return (
    <span className={cn(variants({ tone }), className)} {...props}>
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotColor[tone ?? 'neutral'])} aria-hidden="true" />}
      {children}
    </span>
  );
}
