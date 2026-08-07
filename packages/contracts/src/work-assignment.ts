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
  /**
   * Việc gốc mà lần này làm lại — BC-14 mục 4 bước 5.
   *
   * 🔒 KHÔNG kèm `reworkReason` hay `isBillable`: cả hai do database suy ra từ
   * phán định của người QC trên việc gốc (trigger ở migration 0031). Cho người
   * xếp lịch chọn lại lý do là mở đường đổi "lỗi thợ" thành "khách đổi ý" ở
   * bước sau — tức là đổi luôn việc ai trả tiền.
   */
  reworkOfId: z.string().uuid().optional(),
});
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentInput>;

/**
 * Vì sao một hạng mục phải làm lại — BC-14 mục 3.
 *
 * 🔒 Bốn loại, và việc tách chúng ra KHÔNG phải để cho đẹp: mỗi loại có người
 * chịu tiền khác nhau, và ghi nhận vào chỉ số chất lượng khác nhau.
 *
 * `PART_DEFECT` tách riêng là quan trọng nhất: nó KHÔNG phải lỗi thợ. Gộp
 * chung sẽ oan cho thợ khi tính chỉ số, và hậu quả thực tế là thợ giấu lỗi
 * thay vì báo QC — nguy hiểm hơn nhiều so với một con số thống kê xấu.
 */
export const ReworkReason = z.enum([
  'TECHNICIAN_ERROR',
  'PART_DEFECT',
  'DIAGNOSIS_ERROR',
  'CUSTOMER_CHANGE',
]);
export type ReworkReason = z.infer<typeof ReworkReason>;

export const REWORK_REASON_LABEL: Record<ReworkReason, string> = {
  TECHNICIAN_ERROR: 'Lỗi thi công',
  PART_DEFECT: 'Phụ tùng lỗi',
  DIAGNOSIS_ERROR: 'Chẩn đoán sai',
  CUSTOMER_CHANGE: 'Khách đổi ý',
};

/** Ai chịu chi phí — hiển thị cho người QC thấy hệ quả TRƯỚC khi họ chọn */
export const REWORK_WHO_PAYS: Record<ReworkReason, string> = {
  TECHNICIAN_ERROR: 'Garage chịu — không tính tiền khách',
  PART_DEFECT: 'Nhà cung cấp chịu — không tính tiền khách',
  DIAGNOSIS_ERROR: 'Garage chịu — không tính tiền khách',
  CUSTOMER_CHANGE: 'Khách chịu — vẫn tính tiền như phát sinh',
};

export const ChangeAssignmentStatusInput = z
  .object({
    to: AssignmentStatus,
    /** Bắt buộc khi chuyển sang QC_PASSED / QC_FAILED */
    qcNote: z.string().trim().max(1000).optional(),
    /** Phần trăm hoàn thành khi tạm dừng hoặc huỷ giữa chừng — BC-10 */
    completionPercent: z.number().int().min(0).max(100).optional(),
    /**
     * 🔒 BẮT BUỘC khi QC không đạt — BC-14 mục 2.
     *
     * Ranh giới rework / phát sinh / bảo hành "đôi khi mập mờ trong thực tế".
     * Chính vì mập mờ nên phải bắt người QC quyết, tại thời điểm họ đang cầm
     * chiếc xe trên tay. Để trống rồi suy luận sau là suy luận bằng trí nhớ.
     */
    reworkReason: ReworkReason.optional(),
  })
  .refine((d) => d.to !== 'QC_FAILED' || d.reworkReason !== undefined, {
    message: 'QC không đạt thì phải chọn nguyên nhân — nó quyết định ai trả tiền',
    path: ['reworkReason'],
  })
  .refine((d) => d.to !== 'QC_FAILED' || (d.qcNote ?? '').trim().length >= 10, {
    message: 'QC không đạt thì phải ghi rõ lỗi gì — thợ làm lại cần biết sửa cái gì',
    path: ['qcNote'],
  });
export type ChangeAssignmentStatusInput = z.infer<typeof ChangeAssignmentStatusInput>;

export const WorkAssignment = z.object({
  id: z.string().uuid(),
  repairOrderId: z.string().uuid(),
  repairOrderCode: z.string(),
  plateNumber: z.string(),
  /**
   * Cần cho app thợ: báo phát sinh phải tra danh mục hạng mục ÁP DỤNG ĐƯỢC cho
   * chiếc xe này (lọc theo `powertrain` — 🔒 INV-V-01), mà endpoint danh mục
   * nhận `vehicleId` chứ không nhận mã đơn.
   */
  vehicleId: z.string().uuid(),
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
  /** Việc này LÀ một lần làm lại của việc nào — `null` nếu là việc gốc */
  reworkOfId: z.string().uuid().nullable(),
  reworkReason: ReworkReason.nullable(),
  /** Phán định của người QC về chính việc này khi nó KHÔNG đạt */
  qcReworkReason: ReworkReason.nullable(),
  /** 🔒 `false` = giờ công vẫn ghi cho thợ nhưng KHÔNG tính doanh thu */
  isBillable: z.boolean(),
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
  /**
   * Có giá trị = hạng mục này đang chờ LÀM LẠI, và đây là việc đã QC không đạt.
   * Người xếp lịch phải truyền lại id này để chuỗi làm lại nối được với nhau.
   */
  reworkOfId: z.string().uuid().nullable(),
  reworkReason: ReworkReason.nullable(),
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

/** Chỉ số chất lượng theo thợ — BC-14 mục 5.4 */
export const TechnicianQuality = z.object({
  technicianId: z.string().uuid(),
  technicianName: z.string(),
  soViecDaQc: z.number().int(),
  /** 🔒 KHÔNG gồm `PART_DEFECT` — đó không phải lỗi thợ */
  soViecLoiTho: z.number().int(),
  soViecLoiPhuTung: z.number().int(),
  gioLamLai: z.number(),
  gioTinhTien: z.number(),
  /** `soViecLoiTho / soViecDaQc`, tính sẵn để mọi màn hình dùng chung một định nghĩa */
  tiLeLamLai: z.number(),
});
export type TechnicianQuality = z.infer<typeof TechnicianQuality>;
