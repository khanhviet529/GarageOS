import { z } from 'zod';

/** Khớp enum `assignment_status` — migration 0028 */
export const AssignmentStatus = z.enum([
  'SCHEDULED',
  'IN_PROGRESS',
  'PAUSED',
  'DONE',
  'QC_PASSED',
  'QC_FAILED',
  'CANCELLED',
]);
export type AssignmentStatus = z.infer<typeof AssignmentStatus>;

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  SCHEDULED: 'Đã xếp lịch',
  IN_PROGRESS: 'Đang làm',
  PAUSED: 'Tạm dừng',
  DONE: 'Đã xong',
  QC_PASSED: 'Đạt kiểm tra',
  QC_FAILED: 'Không đạt',
  CANCELLED: 'Đã huỷ',
};

/**
 * Trạng thái nào còn CHIẾM khoang và thợ.
 *
 * 🔒 Phải khớp đúng mệnh đề `WHERE` của hai exclusion constraint ở 0028. Lệch
 * nhau thì giao diện hiển thị một lịch khác với lịch database thật sự bảo vệ:
 * ô trống trên màn hình mà đặt vào thì nhận lỗi trùng, hoặc tệ hơn — ô có vẻ
 * bận mà thật ra đặt được, nên quản lý không dám dùng.
 */
export const ASSIGNMENT_OCCUPIES_RESOURCE: readonly AssignmentStatus[] = [
  'SCHEDULED',
  'IN_PROGRESS',
  'PAUSED',
];

/**
 * Chuyển trạng thái hợp lệ của một phân công.
 *
 * `QC_FAILED` KHÔNG quay lại `IN_PROGRESS`: làm lại là một phân công MỚI trỏ về
 * cái cũ qua `rework_of_id` (BC-14). Sửa tại chỗ thì giờ công của lần làm lại
 * gộp vào lần đầu, và không còn đo được tỉ lệ rework — con số mà `docs/15` mục
 * 6.3 nói phải hiển thị cùng năng suất thợ, đúng để năng suất cao vì làm ẩu
 * không bị đọc thành năng suất tốt.
 */
export const ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, readonly AssignmentStatus[]> = {
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PAUSED', 'DONE', 'CANCELLED'],
  PAUSED: ['IN_PROGRESS', 'CANCELLED'],
  DONE: ['QC_PASSED', 'QC_FAILED'],
  QC_PASSED: [],
  QC_FAILED: [],
  CANCELLED: [],
};

export function canTransitionAssignment(
  from: AssignmentStatus,
  to: AssignmentStatus,
): boolean {
  return ASSIGNMENT_TRANSITIONS[from].includes(to);
}

export const Bay = z.object({
  id: z.string().uuid(),
  branchId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  capabilities: z.array(z.string()),
});
export type Bay = z.infer<typeof Bay>;

/**
 * Phân công một hạng mục cho một thợ ở một khoang.
 *
 * 🔒 `plannedEnd` KHÔNG nhận từ client: nó tính từ giờ định mức của hạng mục.
 * Cho client gửi lên là cho phép đặt một hạng mục 4 giờ vào khung 15 phút để
 * lách exclusion constraint — lịch trên giấy đẹp, xưởng thì kẹt.
 */
export const CreateAssignmentInput = z.object({
  quotationLineId: z.string().uuid(),
  technicianId: z.string().uuid(),
  bayId: z.string().uuid(),
  plannedStart: z.string().datetime({ offset: true }),
});
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentInput>;

export const ChangeAssignmentStatusInput = z.object({
  to: AssignmentStatus,
  /** Bắt buộc khi chuyển sang QC_PASSED / QC_FAILED */
  qcNote: z.string().trim().max(1000).optional(),
  /** Phần trăm hoàn thành khi tạm dừng hoặc huỷ giữa chừng — BC-10 */
  completionPercent: z.number().int().min(0).max(100).optional(),
});
export type ChangeAssignmentStatusInput = z.infer<typeof ChangeAssignmentStatusInput>;

export const WorkAssignment = z.object({
  id: z.string().uuid(),
  repairOrderId: z.string().uuid(),
  repairOrderCode: z.string(),
  plateNumber: z.string(),
  quotationLineId: z.string().uuid(),
  description: z.string(),
  technicianId: z.string().uuid(),
  technicianName: z.string(),
  bayId: z.string().uuid(),
  bayName: z.string(),
  plannedStart: z.string(),
  plannedEnd: z.string(),
  status: AssignmentStatus,
  qcNote: z.string().nullable(),
  completionPercent: z.number().int().nullable(),
  version: z.number().int(),
});
export type WorkAssignment = z.infer<typeof WorkAssignment>;

/** Hạng mục khách đã duyệt mà chưa ai làm */
export const PendingWorkItem = z.object({
  quotationLineId: z.string().uuid(),
  repairOrderId: z.string().uuid(),
  repairOrderCode: z.string(),
  plateNumber: z.string(),
  powertrain: z.string(),
  description: z.string(),
  standardHours: z.number(),
  requiredCertifications: z.array(z.string()),
  /** `HV_SYSTEM` cần khoang có `HV_SAFE_ZONE` — 🔒 INV-W-07 */
  serviceCategory: z.string(),
});
export type PendingWorkItem = z.infer<typeof PendingWorkItem>;

export const TechnicianOption = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  /** Số giờ đã xếp trong ngày — sắp tăng dần để cân tải giữa các thợ */
  loadHours: z.number(),
  /** `false` kèm `reason` để quản lý hiểu vì sao không chọn được */
  eligible: z.boolean(),
  reason: z.string().nullable(),
});
export type TechnicianOption = z.infer<typeof TechnicianOption>;
