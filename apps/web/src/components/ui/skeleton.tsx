import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Khung xương — một ô xám nhấp nháy.
 *
 * `aria-hidden` đặt ở ĐÂY, không phải ở từng chỗ dùng: nếu không, trình đọc
 * màn hình xướng hàng chục dòng "đang tải". Việc thông báo trạng thái tải là
 * việc của phần tử bao ngoài, bằng `role="status"` và MỘT câu.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span aria-hidden className={cn('skeleton', className)} {...props} />;
}
