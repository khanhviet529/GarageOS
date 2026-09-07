import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Nhãn trạng thái — component `Badge` của bộ thiết kế: một chấm màu, một chữ.
 *
 * 🔒 Chấm màu KHÔNG phải kênh thông tin duy nhất — chữ bên cạnh nói đủ nghĩa.
 * Người không phân biệt được đỏ/xanh vẫn đọc được "Quá hẹn 1 ngày".
 *
 * 🔒 `whitespace-nowrap`: nhãn trạng thái không bao giờ được cắt. Cột chật thì
 * đổi sang nhãn ngắn hơn ngay từ đầu, không cắt đuôi — xem khung
 * `KIT — Bảng rộng & chữ dài`, mục "KHÔNG BAO GIỜ CẮT".
 */
const bienThe = cva(
  'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-12 font-medium leading-tight whitespace-nowrap',
  {
    variants: {
      tone: {
        ok: 'bg-ok-soft text-ok',
        warn: 'bg-warn-soft text-warn',
        danger: 'bg-danger-soft text-danger',
        brand: 'bg-brand-soft text-brand',
        trung: 'bg-ink-3 text-text-muted',
      },
    },
    defaultVariants: { tone: 'trung' },
  },
);

const mauCham: Record<NonNullable<VariantProps<typeof bienThe>['tone']>, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  brand: 'bg-brand',
  trung: 'bg-text-muted',
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof bienThe> {
  /** Ẩn chấm khi nhãn đứng cạnh một icon khác — hai dấu hiệu là thừa */
  cham?: boolean;
}

export function Badge({ className, tone, cham = true, children, ...props }: BadgeProps) {
  return (
    <span className={cn(bienThe({ tone }), className)} {...props}>
      {cham && (
        <span
          className={cn('size-1.5 shrink-0 rounded-full', mauCham[tone ?? 'trung'])}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}
