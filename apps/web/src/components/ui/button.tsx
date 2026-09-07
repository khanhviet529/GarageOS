'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Nút — bốn dáng có mặt trong khung `KIT — Ô nhập & xác thực`.
 *
 * 🔒 `pha-huy` DÙNG CHUNG màu với `chinh`. Trong bảng token của dự án chỉ có
 * một màu hành động (`--action`); `--danger` là màu của TRẠNG THÁI (chữ, viền,
 * nền tô mờ), không phải của nút. Tách ra một sắc đỏ thứ hai cho nút xoá là
 * thêm màu ngoài bảng — và ở một bảng vốn đã đỏ thì hai sắc đỏ cạnh nhau đọc
 * ra "hỏng" chứ không đọc ra "nguy hiểm". Điều phân biệt hành động phá huỷ ở
 * đây là HỘP THOẠI xác nhận, không phải sắc độ của nút.
 *
 * 🔒 Trạng thái vô hiệu dùng MÀU RIÊNG chứ không dùng `opacity`: opacity kéo
 * viền và chữ xuống dưới ngưỡng tương phản cùng lúc, biến nút không-bấm-được
 * thành nút không-đọc-được.
 */
const bienThe = cva(
  [
    'inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap',
    'font-medium leading-tight rounded-md cursor-pointer select-none',
    'transition-[background-color,border-color,color] duration-[120ms] ease-out',
    'disabled:cursor-not-allowed disabled:bg-ink-3 disabled:text-text-muted disabled:border-transparent',
    '[&_svg]:shrink-0 [&_svg]:pointer-events-none',
  ].join(' '),
  {
    variants: {
      variant: {
        chinh: 'bg-action text-on-action hover:bg-action-hover',
        'pha-huy': 'bg-action text-on-action hover:bg-action-hover',
        vien: 'bg-transparent text-text-muted border border-line-strong hover:bg-ink-2 hover:text-text',
        chu: 'bg-transparent text-text-muted hover:bg-ink-2 hover:text-text',
        /* Nút phụ dạng chip trong đầu bảng: "Bộ lọc", "Sắp xếp", "Cột hiển thị" */
        chip: 'bg-ink-2 text-text-muted border border-line rounded-sm hover:border-line-strong hover:text-text',
      },
      size: {
        md: 'h-[38px] px-4 text-13 font-semibold',
        sm: 'h-[30px] px-3 text-12 font-semibold',
        chip: 'h-[28px] px-2.5 text-12 font-normal',
        icon: 'h-[34px] w-[34px] px-0',
        /* Nút của khách trên điện thoại: vùng bấm ≥44px (WCAG 2.2 SC 2.5.8) */
        khach: 'min-h-[44px] px-5 text-14 font-semibold',
      },
    },
    defaultVariants: { variant: 'chinh', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof bienThe> {
  asChild?: boolean;
  /**
   * Đang xử lý: nút khoá lại và hiện con quay.
   *
   * 🔒 Đây là cách chặn bấm đúp — ca biên "Bấm đúp nút Gửi" trong khung
   * `KIT — Ca biên`. Chặn thật vẫn ở máy chủ; nút khoá là để hai lead trùng
   * không được tạo ra ngay từ đầu.
   */
  dangXuLy?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, dangXuLy = false, children, disabled, ...props },
  ref,
) {
  /*
   * 🔒 Ở chế độ `asChild`, KHÔNG chèn thêm con nào và KHÔNG truyền `disabled`.
   *
   * `Slot` của Radix đếm số con bằng `React.Children.count`, mà hàm đó tính cả
   * `false` do `{cond && <Icon/>}` sinh ra. Nên một nút `asChild` bọc thẻ <a>
   * nhận hai con và Slot ném "Expected a single React element child" — và vì
   * `next build` kết xuất tĩnh, lỗi đó dừng cả lượt build chứ không chỉ hỏng
   * một lần render. `disabled` cũng không phải thuộc tính hợp lệ của <a>.
   */
  if (asChild) {
    return (
      <Slot ref={ref} className={cn(bienThe({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      className={cn(bienThe({ variant, size }), className)}
      disabled={disabled === true || dangXuLy}
      {...(dangXuLy ? { 'aria-busy': true } : {})}
      {...props}
    >
      {dangXuLy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export { bienThe as buttonVariants };
