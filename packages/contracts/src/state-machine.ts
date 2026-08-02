import { z } from 'zod';
import type { RepairOrderStatus } from './repair-order.js';
import type { QuotationStatus } from './quotation.js';

/**
 * 🔒 Bảng chuyển trạng thái — khai báo MỘT CHỖ DUY NHẤT.
 *
 * Backend dùng để chặn, web và mobile dùng để chỉ vẽ đúng những nút bấm khả
 * dụng. Chép bảng này sang nơi thứ hai là bảo đảm sẽ có một ngày hai nơi lệch
 * nhau, và nơi lệch sẽ là nơi không ai kiểm tra.
 *
 * `DELIVERED` và `CANCELLED` là trạng thái HẤP THỤ — không có đường ra. Xe quay
 * lại vì lỗi cũ tạo ĐƠN MỚI trỏ về đơn cũ, không mở lại đơn cũ.
 */
export const REPAIR_ORDER_TRANSITIONS: Record<RepairOrderStatus, readonly RepairOrderStatus[]> = {
  RECEIVED: ['DIAGNOSING', 'CANCELLED'],
  DIAGNOSING: ['QUOTED', 'CANCELLED'],
  QUOTED: ['AWAITING_APPROVAL', 'CANCELLED'],
  AWAITING_APPROVAL: ['AWAITING_PARTS', 'IN_PROGRESS', 'AWAITING_DELIVERY', 'QUOTED', 'CANCELLED'],
  AWAITING_PARTS: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['AWAITING_APPROVAL', 'AWAITING_PARTS', 'QUALITY_CHECK', 'CANCELLED'],
  QUALITY_CHECK: ['IN_PROGRESS', 'AWAITING_PAYMENT'],
  AWAITING_PAYMENT: ['AWAITING_DELIVERY'],
  AWAITING_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const QUOTATION_TRANSITIONS: Record<QuotationStatus, readonly QuotationStatus[]> = {
  DRAFT: ['SENT', 'SUPERSEDED'],
  SENT: ['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'EXPIRED', 'SUPERSEDED'],
  APPROVED: [],
  PARTIALLY_APPROVED: [],
  REJECTED: [],
  EXPIRED: [],
  SUPERSEDED: [],
};

export function canTransitionRepairOrder(
  from: RepairOrderStatus,
  to: RepairOrderStatus,
): boolean {
  return REPAIR_ORDER_TRANSITIONS[from].includes(to);
}

export function nextRepairOrderStatuses(
  from: RepairOrderStatus,
): readonly RepairOrderStatus[] {
  return REPAIR_ORDER_TRANSITIONS[from];
}

/**
 * Lý do huỷ đơn — 🔒 BẮT BUỘC chọn từ danh sách.
 *
 * Lý do gõ tự do không thống kê được, mà câu hỏi "vì sao khách bỏ đi" là câu
 * hỏi kinh doanh quan trọng nhất mà dữ liệu này trả lời được.
 */
export const CancelCategory = z.enum([
  'CUSTOMER_REQUEST', // khách đổi ý
  'GARAGE_UNABLE',    // xưởng không làm được
  'VEHICLE_ISSUE',    // xe có vấn đề ngoài phạm vi
]);
export type CancelCategory = z.infer<typeof CancelCategory>;

export const ChangeOrderStatusInput = z
  .object({
    to: z.enum([
      'DIAGNOSING',
      'QUOTED',
      'AWAITING_APPROVAL',
      'AWAITING_PARTS',
      'IN_PROGRESS',
      'QUALITY_CHECK',
      'AWAITING_PAYMENT',
      'AWAITING_DELIVERY',
      'DELIVERED',
      'CANCELLED',
    ]),
    /** Số km lúc giao xe — bắt buộc khi chuyển sang DELIVERED */
    odometerOut: z.number().int().nonnegative().max(5_000_000).optional(),
    /** Lúc GIAO XE không đọc được số km — khác cờ cùng tên của lúc tiếp nhận */
    odometerUnavailable: z.boolean().optional(),
    cancelReason: z.string().trim().min(3).max(500).optional(),
    cancelCategory: CancelCategory.optional(),
    /** 🔒 Khoá lạc quan: gửi lên phiên bản đã đọc để không ghi đè việc người khác vừa làm */
    version: z.number().int().nonnegative(),
  })
  .refine((d) => d.to !== 'CANCELLED' || (d.cancelReason !== undefined && d.cancelCategory !== undefined), {
    message: 'Huỷ đơn bắt buộc có lý do và nhóm lý do',
    path: ['cancelReason'],
  })
  .refine(
    (d) => d.to !== 'DELIVERED' || d.odometerOut !== undefined || d.odometerUnavailable === true,
    {
      message: 'Giao xe bắt buộc ghi số km ra, hoặc đánh dấu đồng hồ không đọc được',
      path: ['odometerOut'],
    },
  );
export type ChangeOrderStatusInput = z.infer<typeof ChangeOrderStatusInput>;

export const CANCEL_CATEGORY_LABEL: Record<CancelCategory, string> = {
  CUSTOMER_REQUEST: 'Khách yêu cầu huỷ',
  GARAGE_UNABLE: 'Xưởng không thực hiện được',
  VEHICLE_ISSUE: 'Vấn đề của xe ngoài phạm vi',
};

/** Nhãn cho NÚT BẤM — khác nhãn trạng thái: nút là hành động, không phải tình trạng */
export const ORDER_ACTION_LABEL: Record<RepairOrderStatus, string> = {
  RECEIVED: 'Tiếp nhận',
  DIAGNOSING: 'Bắt đầu kiểm tra',
  QUOTED: 'Chuyển về lập báo giá',
  AWAITING_APPROVAL: 'Gửi khách duyệt',
  AWAITING_PARTS: 'Chờ phụ tùng',
  IN_PROGRESS: 'Bắt đầu sửa',
  QUALITY_CHECK: 'Chuyển kiểm tra chất lượng',
  AWAITING_PAYMENT: 'Đạt — chuyển thanh toán',
  AWAITING_DELIVERY: 'Đã thu tiền — chờ giao xe',
  DELIVERED: 'Giao xe cho khách',
  CANCELLED: 'Huỷ đơn',
};

/**
 * 🔒 Vai nào được thực hiện chuyển trạng thái nào —
 * `docs/02-actors-and-permissions.md` mục 3 (ma trận quyền).
 *
 * codex-review GARAGEOS-REV-002: bản đầu chỉ kiểm tenant, phạm vi chi nhánh và
 * đường chuyển hợp lệ, mà quên kiểm VAI. Một thợ hoặc thủ kho thuộc đúng chi
 * nhánh gọi thẳng API là huỷ được đơn hoặc giao được xe.
 *
 * Ba câu hỏi phải hỏi theo đúng thứ tự: đúng tenant chưa (RLS), đúng phạm vi
 * chưa (branchScope), rồi mới tới đúng vai chưa (bảng này). Thiếu câu cuối thì
 * hai câu đầu chỉ chặn được người ngoài, không chặn được người trong.
 *
 * Vai không nêu ở đây thì không làm được — danh sách là DANH SÁCH CHO PHÉP,
 * không phải danh sách cấm. Thêm vai mới mà quên khai báo thì nó bị chặn, chứ
 * không phải được thả.
 */
export const TRANSITION_ROLES: Record<RepairOrderStatus, readonly string[]> = {
  // Chưa dùng: RECEIVED là trạng thái khởi tạo, không ai "chuyển sang" nó
  RECEIVED: [],
  // Bắt đầu chẩn đoán: cố vấn mở việc, quản lý phân công
  DIAGNOSING: ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  QUOTED: ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  AWAITING_APPROVAL: ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  // Chờ phụ tùng là việc của kho
  AWAITING_PARTS: ['STORE_KEEPER', 'SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  IN_PROGRESS: ['STORE_KEEPER', 'SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  // Thợ báo xong việc -> chuyển sang kiểm tra chất lượng
  QUALITY_CHECK: ['TECHNICIAN', 'SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  // 🔒 INV-W-04: người QC không được là người đã làm — chưa enforce được vì
  //    bảng phân công thuộc Phase 2. Ở đây mới chặn theo vai.
  AWAITING_PAYMENT: ['TECHNICIAN', 'SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  // Thu tiền là việc của thu ngân
  AWAITING_DELIVERY: ['CASHIER', 'SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  DELIVERED: ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
  CANCELLED: ['SERVICE_ADVISOR', 'BRANCH_MANAGER', 'OWNER'],
};

export function canRoleTransition(roles: readonly string[], to: RepairOrderStatus): boolean {
  return roles.some((r) => TRANSITION_ROLES[to].includes(r));
}
