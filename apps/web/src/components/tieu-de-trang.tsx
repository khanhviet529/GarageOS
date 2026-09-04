import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Hàng tiêu đề của mọi màn hình nội bộ: tên màn + một dòng ngữ cảnh, hành động
 * dồn về phải.
 *
 * Dòng ngữ cảnh (`phu`) không phải chỗ trang trí — trong bộ thiết kế nó luôn
 * trả lời "đang xem cái gì, của lúc nào, ở chi nhánh nào". Một con số không có
 * kỳ và không có phạm vi là một con số không dùng được để ra quyết định.
 */
export function TieuDeTrang({
  tieuDe,
  phu,
  children,
  className,
  cap = 'h1',
}: {
  tieuDe: ReactNode;
  phu?: ReactNode;
  /** Nút hành động, dồn về mép phải */
  children?: ReactNode;
  className?: string;
  cap?: 'h1' | 'h2';
}) {
  const The = cap;
  return (
    <div className={cn('flex flex-wrap items-center gap-4', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <The className="text-26 font-bold tracking-[-0.7px] text-text">{tieuDe}</The>
        {phu !== undefined && <p className="text-13 text-text-dim">{phu}</p>}
      </div>
      {children !== undefined && (
        <div className="ml-auto flex flex-wrap items-center gap-2.5">{children}</div>
      )}
    </div>
  );
}
