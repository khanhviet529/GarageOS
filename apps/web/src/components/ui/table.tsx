import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Bảng — dáng vẻ nằm ở `globals.css` (`table`, `th`, `td`), ở đây chỉ là lớp
 * ngữ nghĩa để mã trang đọc ra là "bảng của hệ thiết kế" chứ không phải một
 * thẻ HTML trần.
 *
 * 🔒 Không tự bọc vùng cuộn ở đây. Bảng rộng phải nằm trong `BangCuon`, vốn
 * thêm `role="region"` + `tabIndex` để người dùng bàn phím cuộn được (WCAG
 * 2.1.1) — một `overflow-x: auto` trần tạo ra vùng cuộn chỉ chuột dùng được.
 * Bọc ngầm ở đây thì chỗ nào cũng có vùng cuộn, kể cả bảng hai cột không bao
 * giờ tràn, và mỗi cái là một điểm dừng Tab thừa.
 */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn(className)} {...props} />;
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn(className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn(className)} {...props} />;
}

export function TableFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot className={cn(className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn(className)} {...props} />;
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn(className)} {...props} />;
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn(className)} {...props} />;
}

export function TableCaption({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <caption className={cn('sr-only', className)} {...props} />;
}
