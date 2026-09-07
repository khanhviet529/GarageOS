import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Thẻ — khối nội dung nổi trên nền trang.
 *
 * 🔒 Luôn giữ class `card`. Bộ E2E chọn phần tử qua nó ở 9 kịch bản
 * (`page.locator('.card', { has: heading … })`, `section.card`), nên nó là một
 * phần của hợp đồng, không phải một chi tiết trình bày. Dáng vẻ nằm ở
 * `globals.css`; ở đây chỉ thêm phần bố cục.
 */
export function Card({
  className,
  as: Comp = 'div',
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article' | 'aside' }) {
  return <Comp className={cn('card', className)} {...props} />;
}

/** Hàng đầu thẻ: tiêu đề bên trái, nhãn kỹ thuật hoặc nút bên phải */
export function CardHead({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2', className)} {...props} />;
}

export function CardTitle({
  className,
  as: Comp = 'h2',
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' | 'h4' }) {
  return <Comp className={cn('text-14 font-semibold text-text', className)} {...props} />;
}

/** Nhãn mono viết hoa ở mép phải hàng tiêu đề — "BƯỚC 1/3", "CHƯA XUẤT KHO" */
export function CardNote({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('nhan-ky-thuat ml-auto', className)} {...props} />;
}

/**
 * Dòng khoá–giá trị trong thẻ: nhãn trái, dấu chấm lửng giãn, giá trị phải.
 * Dùng ở "Thông tin xe", "Tiền tạm tính", "Tổng cộng".
 */
export function DongKhoaGiaTri({
  khoa,
  children,
  cuoi = false,
  className,
}: {
  khoa: React.ReactNode;
  children: React.ReactNode;
  /** Dòng cuối không có đường kẻ dưới */
  cuoi?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 py-2',
        cuoi ? '' : 'border-b border-line',
        className,
      )}
    >
      <span className="text-12 text-text-dim">{khoa}</span>
      <span className="ml-auto text-12 font-mono text-text">{children}</span>
    </div>
  );
}
