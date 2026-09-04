import type { ReactNode } from 'react';

/**
 * Trạng thái "không có gì để hiển thị" — dùng khi một truy vấn trả về rỗng.
 *
 * Vì sao tách riêng khỏi `ErrorState`:
 *   - Lỗi mạng là sự cố, cần nút "Thử lại". Rỗng là kết quả hợp lệ — dữ liệu
 *     có thể chưa có (đơn đầu tiên trong ngày, danh sách báo cáo tháng mới),
 *     không phải lỗi.
 *   - Trộn hai trạng thái vào một component dẫn tới giao diện "không có gì để
 *     hiển thị — Thử lại" — câu sau đó vô nghĩa.
 *
 * Cấu trúc gợi ý dùng:
 *   - `title`        câu trả lời trực tiếp cho "có gì ở đây không"
 *   - `description`  giải thích vì sao (nếu cần), không lặp lại title
 *   - `action`       nút bấm duy nhất khi có bước tiếp theo rõ ràng
 *                    (ví dụ "Tạo khách hàng đầu tiên"). Không đặt nếu rỗng
 *                    là điều bình thường — nút "Tạo" hiện khi đã có dữ liệu
 *                    là hợp lý, hiện khi rỗng lại trở thành quảng cáo.
 *   - `icon`         tùy chọn; nhỏ, đơn sắc, KHÔNG phải illustration màu mè
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
      {icon !== undefined && <div className="empty-icon" aria-hidden="true">{icon}</div>}
      <h3 className="empty-title">{title}</h3>
      {description !== undefined && <p className="muted small empty-desc">{description}</p>}
      {action !== undefined && <div className="empty-action">{action}</div>}
    </div>
  );
}
