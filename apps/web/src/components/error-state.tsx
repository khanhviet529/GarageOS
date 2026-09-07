'use client';

import { CircleX } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Trạng thái lỗi CÓ LỐI RA.
 *
 * Trước component này, mọi trạng thái lỗi trong dự án là ngõ cụt: một dòng chữ
 * đỏ và không có gì để bấm. Nặng nhất là màn lập báo giá — tải danh mục lỗi thì
 * toàn bộ vùng chọn hạng mục biến mất, cố vấn đang ngồi cạnh khách chỉ còn cách
 * F5.
 *
 * Lỗi mạng là chuyện thường ở wifi xưởng. Thứ phân biệt phần mềm dùng được với
 * phần mềm khó chịu không phải là ít lỗi hơn, mà là mỗi lỗi có một bước tiếp
 * theo rõ ràng.
 *
 * 🔒 Giữ class `alert error`: bốn kịch bản E2E khẳng định quyền qua
 * `page.locator('.alert.error')`. `getByRole('alert')` không dùng được vì Next
 * chèn sẵn một `role="alert"` rỗng (route announcer) vào mọi trang.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert error" role="alert">
      <div className="flex items-start gap-2.5">
        <CircleX className="mt-px size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">{message}</div>
      </div>
      {onRetry !== undefined && (
        <Button variant="vien" size="sm" className="mt-2.5" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}

/** Trạng thái đang tải — một chỗ duy nhất, để mọi màn hình nói cùng một câu. */
export function Loading({ what = 'dữ liệu' }: { what?: string }) {
  return (
    <p className="text-12 text-text-dim" role="status">
      Đang tải {what}…
    </p>
  );
}
