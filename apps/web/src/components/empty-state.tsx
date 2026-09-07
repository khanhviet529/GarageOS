import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

/**
 * Trạng thái "không có gì để hiển thị" — khi một truy vấn trả về rỗng.
 *
 * Vì sao tách riêng khỏi `ErrorState`:
 *   - Lỗi mạng là sự cố, cần nút "Thử lại". Rỗng là kết quả hợp lệ — dữ liệu
 *     có thể chưa có (đơn đầu tiên trong ngày, báo cáo tháng mới), không phải
 *     lỗi. Trộn hai thứ vào một component dẫn tới "không có gì để hiển thị —
 *     Thử lại", và câu sau đó vô nghĩa.
 *
 * Cấu trúc:
 *   - `title`        trả lời thẳng "có gì ở đây không"
 *   - `description`  vì sao (nếu cần), không lặp lại title
 *   - `action`       MỘT nút khi có bước tiếp theo rõ ràng. Không đặt nếu rỗng
 *                    là điều bình thường — nút "Tạo" hiện lúc rỗng thành quảng cáo
 *   - `icon`         nhỏ, đơn sắc, KHÔNG phải minh hoạ màu mè
 */
interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-icon" aria-hidden>
        {icon ?? <Inbox className="size-7" />}
      </span>
      <h3 className="empty-title">{title}</h3>
      {description !== undefined && <p className="empty-desc">{description}</p>}
      {action !== undefined && <div className="empty-action">{action}</div>}
    </div>
  );
}
