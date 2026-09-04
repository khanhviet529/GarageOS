import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * Bảng cuộn NGANG trong khung của chính nó, không đẩy cả trang trượt ngang.
 * Cột đầu được ghim bằng `position: sticky` ở từng ô — xem `TableCell`/`TableHead`
 * với cờ `pinned`.
 */
export function TableWrap({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('w-full overflow-x-auto', className)} {...props} />;
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>): React.ReactElement {
  return <table className={cn('w-full border-collapse text-[13px]', className)} {...props} />;
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>): React.ReactElement {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-line', className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>): React.ReactElement {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>): React.ReactElement {
  return <tr className={cn('border-b border-line transition-colors hover:bg-ink-2', className)} {...props} />;
}

export function TableHead({
  className,
  pinned = false,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { pinned?: boolean }): React.ReactElement {
  return (
    <th
      className={cn(
        'tech-label whitespace-nowrap px-3 py-2.5 text-left text-text-muted',
        pinned && 'sticky left-0 z-10 bg-ink-1',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  pinned = false,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { pinned?: boolean }): React.ReactElement {
  return (
    <td
      className={cn('px-3 py-2.5 align-middle text-text', pinned && 'sticky left-0 z-10 bg-ink-1', className)}
      {...props}
    />
  );
}
