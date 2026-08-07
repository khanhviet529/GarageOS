import { z } from 'zod';

/**
 * Lý do KẾT THÚC một đoạn giờ công — khớp enum `pause_reason` ở 0030.
 *
 * 🔒 KHÔNG lý do nào tính vào giờ công: đó là thời gian CHỜ, không phải thời
 * gian LÀM. Nhưng phân loại vẫn quan trọng — nó là dữ liệu duy nhất trả lời
 * được "xe nằm lâu vì ai", và đó là báo cáo 6.2 của roadmap.
 */
export const PauseReason = z.enum([
  'WAITING_PARTS',
  'WAITING_APPROVAL',
  'WAITING_EQUIPMENT',
  'SHIFT_END',
  'REASSIGNED',
  'OTHER',
]);
export type PauseReason = z.infer<typeof PauseReason>;

export const PAUSE_REASON_LABEL: Record<PauseReason, string> = {
  WAITING_PARTS: 'Chờ phụ tùng',
  WAITING_APPROVAL: 'Chờ khách duyệt',
  WAITING_EQUIPMENT: 'Thiếu thiết bị',
  SHIFT_END: 'Hết ca',
  REASSIGNED: 'Chuyển người khác',
  OTHER: 'Lý do khác',
};

/**
 * Bộ phận chịu trách nhiệm cho từng loại chờ — BC-06 mục 3.
 *
 * Đặt ở contracts để báo cáo "thời gian chờ theo bộ phận" (6.2) và giao diện
 * dùng cùng một cách quy trách nhiệm. Hai bản cài đặt của cùng một bảng phân
 * loại thì sớm muộn cũng lệch, và lúc đó hai báo cáo cùng nói về một tuần lại
 * ra hai con số khác nhau.
 */
export const PAUSE_ACCOUNTABLE: Record<PauseReason, string> = {
  WAITING_PARTS: 'Kho / mua hàng',
  WAITING_APPROVAL: 'Khách hàng',
  WAITING_EQUIPMENT: 'Xưởng',
  SHIFT_END: '—',
  REASSIGNED: 'Quản lý',
  OTHER: 'Cần xem ghi chú',
};

/**
 * Bắt đầu một đoạn giờ công.
 *
 * KHÔNG nhận `startedAt`: giờ bắt đầu là `now()` ở server. Cho client gửi lên
 * là cho phép lùi giờ để làm đẹp số liệu năng suất, mà đó chính là con số dùng
 * để tính lương.
 *
 * Nhập hộ cho một đoạn thợ quên bấm (BC-06 mục 4.2) đi đường riêng — xem
 * `EnterTimeLogInput`.
 */
export const StartTimeLogInput = z.object({
  workAssignmentId: z.string().uuid(),
});
export type StartTimeLogInput = z.infer<typeof StartTimeLogInput>;

/** Đóng đoạn đang mở. `reason` bỏ trống nghĩa là đóng vì hạng mục xong. */
export const StopTimeLogInput = z.object({
  workAssignmentId: z.string().uuid(),
  reason: PauseReason.optional(),
  note: z.string().trim().max(1000).optional(),
});
export type StopTimeLogInput = z.infer<typeof StopTimeLogInput>;

/**
 * Quản lý nhập hộ một đoạn đã xảy ra — BC-06 mục 4.2.
 *
 * 🔒 Ba ràng buộc, mỗi cái chặn một cách gian lận khác nhau:
 *  - Không lùi quá 24 giờ: chỉnh sửa số liệu cũ đã vào báo cáo
 *  - `startedAt` < `endedAt`, và cả hai ở quá khứ: không "nhập trước" giờ chưa làm
 *  - `INV-W-06` ở DB: không chồng với đoạn khác của cùng thợ
 */
export const EnterTimeLogInput = z.object({
  workAssignmentId: z.string().uuid(),
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }),
  /** BẮT BUỘC — nhập hộ không lý do là một dòng số liệu không giải thích được */
  note: z.string().trim().min(5, 'Nhập hộ giờ công phải ghi lý do').max(1000),
});
export type EnterTimeLogInput = z.infer<typeof EnterTimeLogInput>;

export const TimeLogSegment = z.object({
  id: z.string().uuid(),
  workAssignmentId: z.string().uuid(),
  technicianId: z.string().uuid(),
  technicianName: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  pauseReason: PauseReason.nullable(),
  /** 🔒 Đoạn do job đóng hộ — số liệu KHÔNG đáng tin để tính lương */
  autoClosed: z.boolean(),
  /** Khác `technicianId` nghĩa là có người nhập hộ */
  enteredByName: z.string(),
  note: z.string().nullable(),
  /** Số giờ của riêng đoạn này; đoạn đang mở tính tới hiện tại */
  hours: z.number(),
});
export type TimeLogSegment = z.infer<typeof TimeLogSegment>;

/**
 * Tổng hợp giờ công của một phân công.
 *
 * 🔒 `standardHours` và `actualHours` là HAI THỨ KHÁC NHAU và không được lẫn:
 *
 *   Tiền công khách trả = standardHours × đơn giá giờ
 *   Năng suất thợ       = standardHours / actualHours
 *
 * Khách trả theo ĐỊNH MỨC. Thợ làm chậm là vấn đề nội bộ của garage, không phải
 * của khách; thợ làm nhanh thì phần chênh là lãi của garage. Tính tiền khách
 * theo giờ thực tế là sai lầm nặng nhất mà BC-06 mục 6 liệt kê.
 */
export const AssignmentTimeSummary = z.object({
  workAssignmentId: z.string().uuid(),
  standardHours: z.number(),
  actualHours: z.number(),
  /** `null` khi chưa có giờ thực tế nào — không chia cho 0 */
  efficiency: z.number().nullable(),
  /** Đang có đoạn mở: thợ đang làm ngay lúc này */
  dangLam: z.boolean(),
  /** 🔒 actualHours > standardHours × 1.5 — cảnh báo, KHÔNG chặn (BC-06 mục 4.5) */
  vuotDinhMucNhieu: z.boolean(),
  /** Có đoạn do job đóng hộ — đọc số liệu này phải dè dặt */
  coDoanDongHo: z.boolean(),
  segments: z.array(TimeLogSegment),
});
export type AssignmentTimeSummary = z.infer<typeof AssignmentTimeSummary>;
