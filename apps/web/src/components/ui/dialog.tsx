'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Hộp thoại — khung `KIT — Thông báo & hộp thoại`.
 *
 * 🔒 "Nền mờ, bấm ngoài KHÔNG đóng nếu là hành động phá huỷ." Đó là ý nghĩa
 * của prop `phaHuy`: nó chặn cả bấm-ra-ngoài lẫn phím Esc, để một cú bấm nhầm
 * không vứt mất phần người dùng vừa gõ vào ô xác nhận. Hộp thoại thường thì
 * đóng được bằng cả hai cách — giữ lối thoát rẻ tiền cho việc rẻ tiền.
 *
 * Radix lo phần trợ năng vốn dễ làm sai và khó test bằng mắt: bẫy tiêu điểm
 * trong hộp, trả tiêu điểm về đúng nút đã mở nó, `aria-modal`, và khoá cuộn
 * nền. Đây chính là chỗ một thư viện xứng đáng có mặt.
 */
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogOverlay({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-[#08090ab8] data-[state=open]:animate-mo-dan',
        className,
      )}
      {...props}
    />
  );
}

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Hành động không lùi lại được: chặn đóng bằng bấm ngoài và bằng Esc */
  phaHuy?: boolean;
  /** Ẩn nút × ở góc — chỉ khi hộp thoại đã có nút Huỷ rõ ràng ở chân */
  anNutDong?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(function DialogContent(
  { className, children, phaHuy = false, anNutDong = false, ...props },
  ref,
) {
  const chan = phaHuy
    ? {
        onPointerDownOutside: (e: Event) => e.preventDefault(),
        onEscapeKeyDown: (e: KeyboardEvent) => e.preventDefault(),
        onInteractOutside: (e: Event) => e.preventDefault(),
      }
    : {};

  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2',
          'max-h-[calc(100dvh-48px)] overflow-y-auto',
          'rounded-lg border border-line-strong bg-ink-2 p-5',
          'flex flex-col gap-3.5',
          'data-[state=open]:animate-hien-len',
          className,
        )}
        {...chan}
        {...props}
      >
        {children}
        {!anNutDong && (
          <DialogPrimitive.Close
            className="absolute right-4 top-4 grid size-7 place-items-center rounded-sm text-text-dim transition-colors hover:bg-ink-3 hover:text-text"
            aria-label="Đóng hộp thoại"
          >
            <X className="size-3.5" aria-hidden />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

/** Đầu hộp thoại: huy hiệu icon tròn bên trái, tiêu đề + mô tả bên phải */
function DialogHeader({
  icon,
  tone = 'trung',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  icon?: React.ReactNode;
  tone?: 'danger' | 'warn' | 'trung';
}) {
  const nen =
    tone === 'danger' ? 'bg-danger-soft text-danger'
    : tone === 'warn' ? 'bg-warn-soft text-warn'
    : 'bg-ink-3 text-text-muted';
  return (
    <div className={cn('flex gap-3 pr-8', className)} {...props}>
      {icon !== undefined && (
        <span className={cn('grid size-[34px] shrink-0 place-items-center rounded-full', nen)}>
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">{children}</div>
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-15 font-bold leading-tight tracking-[-0.3px] text-text', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-12 leading-body text-text-muted', className)}
      {...props}
    />
  );
}

/** Chân hộp thoại: nút phụ trước, nút chính sau, dồn về phải */
function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-end gap-2.5 pt-1', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
