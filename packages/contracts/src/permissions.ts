import type { Role } from './roles.js';

/**
 * 🔒 Ai được làm gì — `docs/02-actors-and-permissions.md` mục 3 (ma trận quyền).
 *
 * Vì sao bảng này tồn tại, viết ra để lần sau không ai gỡ nó đi:
 *
 * Trước bảng này, dự án có hàm `hasRole()` trong `actor.ts` mà **không nơi nào
 * gọi**, và kiểm tra vai chỉ được cài ở đúng MỘT endpoint (`changeStatus`, sau
 * codex-review GARAGEOS-REV-002). Kết quả đo được bằng thực nghiệm: một
 * `TECHNICIAN` đăng nhập rồi gọi thẳng API là tạo được khách hàng, tạo được xe,
 * tiếp nhận được đơn, lập được báo giá, và đẩy đơn qua hai bước máy trạng thái —
 * trong khi cùng người đó bị chặn 403 ở endpoint đổi trạng thái. Một cửa khoá,
 * năm cửa mở.
 *
 * Bài học: kiểm tra quyền rải rác theo từng service thì chỗ nào có người review
 * kỹ mới có. Khai báo tập trung thì thiếu sót nhìn thấy được.
 *
 * Đây là DANH SÁCH CHO PHÉP: vai không có tên thì không làm được. Thêm vai mới
 * mà quên khai báo sẽ bị chặn, chứ không phải được thả.
 */
export const ACTION_ROLES = {
  /** Tạo hồ sơ khách hàng — biển số và hồ sơ khách là khoá của toàn bộ lịch sử xe */
  'customer:create': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  'vehicle:create': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],

  /** Tiếp nhận xe — docs/02 mục 3, hàng "Đơn sửa chữa / Tạo" */
  'repairOrder:create': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],

  /** Lập và sửa báo giá — hàng "Báo giá / Lập-sửa (bản nháp)" */
  'quotation:write': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  /** Gửi báo giá cho khách — hàng "Báo giá / Gửi cho khách" */
  'quotation:send': ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],

  /**
   * 🔒 Áp chiết khấu vượt ngưỡng của tenant — PR-03.
   * Cố vấn áp được chiết khấu trong ngưỡng; vượt ngưỡng cần quản lý duyệt.
   */
  'quotation:discountOverThreshold': ['BRANCH_MANAGER', 'OWNER'],
} as const satisfies Record<string, readonly Role[]>;

export type PermissionAction = keyof typeof ACTION_ROLES;

export function canDo(roles: readonly string[], action: PermissionAction): boolean {
  return roles.some((r) => (ACTION_ROLES[action] as readonly string[]).includes(r));
}

/** Nhãn tiếng Việt cho thông báo lỗi — người dùng không đọc mã hành động */
export const ACTION_LABEL: Record<PermissionAction, string> = {
  'customer:create': 'tạo hồ sơ khách hàng',
  'vehicle:create': 'tạo hồ sơ xe',
  'repairOrder:create': 'tiếp nhận xe',
  'quotation:write': 'lập hoặc sửa báo giá',
  'quotation:send': 'gửi báo giá cho khách',
  'quotation:discountOverThreshold': 'áp chiết khấu vượt ngưỡng',
};
