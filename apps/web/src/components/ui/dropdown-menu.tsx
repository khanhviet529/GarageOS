'use client';

import * as React from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Trình đơn thả xuống — dùng cho "Bộ lọc", "Sắp xếp", "Cột hiển thị".
 *
 * 🔒 KHÔNG dùng cho "Bước tiếp theo" của đơn sửa chữa, dù trong thiết kế có
 * một nút "Chuyển trạng thái" ở hàng tiêu đề. Lý do: những bước hợp lệ phải
 * NHÌN THẤY ĐƯỢC mà không cần bấm. Giấu chúng sau một cú bấm biến câu hỏi
 * "bây giờ làm gì tiếp" thành một việc phải đi tìm — và với màn hình cố vấn mở
 * suốt ngày, đó là đánh đổi sai. Xem `StatusActions.tsx`.
 */
const DropdownMenu = Menu.Root;
const DropdownMenuTrigger = Menu.Trigger;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof Menu.Content>,
  React.ComponentPropsWithoutRef<typeof Menu.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <Menu.Portal>
      <Menu.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[180px] overflow-hidden rounded-md border border-line bg-ink-1 p-1',
          'shadow-[0_12px_32px_#08090a5c]',
          'data-[state=open]:animate-hien-len',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
});

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Label>) {
  return <Menu.Label className={cn('nhan-ky-thuat px-2.5 py-2', className)} {...props} />;
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-2 text-12 text-text-muted outline-none',
        'data-[highlighted]:bg-ink-3 data-[highlighted]:text-text',
        'data-[disabled]:cursor-not-allowed data-[disabled]:text-text-dim',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-sm py-2 pl-7 pr-2.5 text-12 text-text-muted outline-none',
        'relative data-[highlighted]:bg-ink-3 data-[highlighted]:text-text',
        className,
      )}
      {...props}
    >
      <Menu.ItemIndicator className="absolute left-2 grid place-items-center">
        <Check className="size-3 text-brand" aria-hidden />
      </Menu.ItemIndicator>
      {children}
    </Menu.CheckboxItem>
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-2 pl-7 pr-2.5 text-12 text-text-muted outline-none',
        'data-[highlighted]:bg-ink-3 data-[highlighted]:text-text',
        className,
      )}
      {...props}
    >
      <Menu.ItemIndicator className="absolute left-2 grid place-items-center">
        <Check className="size-3 text-brand" aria-hidden />
      </Menu.ItemIndicator>
      {children}
    </Menu.RadioItem>
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('my-1 h-px bg-line', className)} {...props} />;
}

const DropdownMenuRadioGroup = Menu.RadioGroup;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
};
