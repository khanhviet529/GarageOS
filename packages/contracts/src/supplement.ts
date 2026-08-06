import { z } from 'zod';

/** Khớp enum `supplement_status` — migration 0032 */
export const SupplementStatus = z.enum([
  'REPORTED',
  'QUOTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
export type SupplementStatus = z.infer<typeof SupplementStatus>;

export const SUPPLEMENT_STATUS_LABEL: Record<SupplementStatus, string> = {
  REPORTED: 'Thợ vừa báo',
  QUOTED: 'Đã gửi khách',
  APPROVED: 'Khách đồng ý',
  REJECTED: 'Khách từ chối',
  CANCELLED: 'Đã huỷ',
};

/**
 * Thợ báo phát sinh — BC-03 mục 4 bước 1–3.
 *
 * 🔒 BR-02-2: thợ ĐỀ XUẤT, cố vấn mới lập báo giá. Đây là lý do đầu vào chỉ có
 * `serviceItemId` (hạng mục trong danh mục) chứ không có giá: người phát hiện
 * vấn đề không phải người định giá.
 */
export const ReportSupplementInput = z.object({
  repairOrderId: z.string().uuid(),
  /** Hạng mục đề xuất làm thêm, chọn từ danh mục */
  serviceItemId: z.string().uuid(),
  /** Phân công thợ đang làm khi phát hiện — bỏ trống nếu phát hiện lúc QC */
  foundInAssignmentId: z.string().uuid().optional(),
  description: z
    .string()
    .trim()
    .min(10, 'Mô tả phát sinh phải đủ rõ để cố vấn giải thích được cho khách')
    .max(1000),
  /**
   * 🔒 BR-07-5 — những hạng mục BỊ CHẶN bởi phát sinh này.
   *
   * Thợ chọn, vì chỉ người đang cầm cờ-lê mới biết đĩa phanh vênh thì có lắp
   * được má phanh không. Để trống nghĩa là phát sinh KHÔNG chặn việc nào —
   * hoàn toàn hợp lệ, và là trường hợp thường gặp nhất (ví dụ "nên thay luôn
   * dầu phanh").
   *
   * Danh sách rỗng KHÔNG phải lỗi, nhưng cũng không mặc định chặn hết: dừng cả
   * đơn vì một phát sinh không liên quan là lãng phí thợ và khoang.
   */
  blocksAssignmentIds: z.array(z.string().uuid()).default([]),
});
export type ReportSupplementInput = z.infer<typeof ReportSupplementInput>;

/**
 * Cố vấn quyết định sau khi khách TỪ CHỐI phát sinh — BC-03 mục 5.1 và 5.2.
 *
 * Hai nhánh khác hẳn nhau:
 *  - `CONTINUE`: hạng mục gốc vẫn làm được (khách từ chối "nên thay luôn dầu
 *    phanh" thì việc thay má phanh vẫn tiến hành). Gỡ tạm dừng.
 *  - `CANNOT_PROCEED`: hạng mục gốc KHÔNG làm được nữa (không lắp má phanh mới
 *    lên đĩa vênh). Huỷ phân công, nhả giữ chỗ phụ tùng.
 *
 * 🔒 Bắt buộc chọn, không mặc định. Mặc định `CONTINUE` sẽ để thợ lắp má phanh
 * lên đĩa vênh; mặc định `CANNOT_PROCEED` sẽ huỷ oan những việc vẫn làm được.
 */
export const ResolveSupplementInput = z.object({
  decision: z.enum(['CONTINUE', 'CANNOT_PROCEED']),
  note: z
    .string()
    .trim()
    .min(10, 'Phải ghi lý do kỹ thuật — đây là căn cứ nếu khách khiếu nại sau này')
    .max(1000),
});
export type ResolveSupplementInput = z.infer<typeof ResolveSupplementInput>;

export const BlockedAssignment = z.object({
  assignmentId: z.string().uuid(),
  description: z.string(),
  technicianName: z.string(),
  statusHienTai: z.string(),
});
export type BlockedAssignment = z.infer<typeof BlockedAssignment>;

export const SupplementRequest = z.object({
  id: z.string().uuid(),
  repairOrderId: z.string().uuid(),
  repairOrderCode: z.string(),
  plateNumber: z.string(),
  serviceItemId: z.string().uuid(),
  serviceItemName: z.string(),
  /** Giờ định mức và giá THAM KHẢO theo bảng giá hiện hành — cố vấn vẫn phải lập báo giá */
  standardHours: z.number(),
  description: z.string(),
  status: SupplementStatus,
  quotationId: z.string().uuid().nullable(),
  resolutionNote: z.string().nullable(),
  reportedByName: z.string(),
  createdAt: z.string(),
  blocks: z.array(BlockedAssignment),
});
export type SupplementRequest = z.infer<typeof SupplementRequest>;
