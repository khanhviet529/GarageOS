import { z } from 'zod';
import { moneyAmount } from './money.js';

/**
 * Khách không đến lấy xe — BC-15.
 *
 * 💡 `AWAITING_DELIVERY` không phân biệt được "xe xong chiều nay, khách đến lấy"
 * với "xe xong ba tháng trước, khách biến mất". File này thêm chiều dữ liệu còn
 * thiếu: thời gian nằm chờ và trạng thái liên hệ.
 */

export const AbandonmentStatus = z.enum([
  'NONE',
  'OVERDUE',
  'UNREACHABLE',
  'DECLARED_ABANDONED',
]);
export type AbandonmentStatus = z.infer<typeof AbandonmentStatus>;

export const ABANDONMENT_STATUS_LABEL: Record<AbandonmentStatus, string> = {
  NONE: 'Bình thường',
  OVERDUE: 'Quá hạn nhận xe',
  UNREACHABLE: 'Không liên lạc được',
  DECLARED_ABANDONED: 'Đánh dấu bỏ xe',
};

export const ContactChannel = z.enum(['PHONE', 'SMS', 'ZALO', 'EMAIL', 'REGISTERED_MAIL']);
export type ContactChannel = z.infer<typeof ContactChannel>;

export const CONTACT_CHANNEL_LABEL: Record<ContactChannel, string> = {
  PHONE: 'Gọi điện',
  SMS: 'Tin nhắn SMS',
  ZALO: 'Zalo',
  EMAIL: 'Thư điện tử',
  REGISTERED_MAIL: 'Thư bảo đảm',
};

export const ContactOutcome = z.enum([
  'ANSWERED',
  'NO_ANSWER',
  'WRONG_NUMBER',
  'PROMISED_DATE',
  'REFUSED',
]);
export type ContactOutcome = z.infer<typeof ContactOutcome>;

export const CONTACT_OUTCOME_LABEL: Record<ContactOutcome, string> = {
  ANSWERED: 'Khách nghe máy',
  NO_ANSWER: 'Không ai nghe',
  WRONG_NUMBER: 'Số không đúng',
  PROMISED_DATE: 'Khách hẹn ngày',
  REFUSED: 'Khách từ chối nhận xe',
};

/**
 * Ghi một lần liên hệ.
 *
 * 💡 Đây là BẰNG CHỨNG, không phải ghi chú. Nếu sau này phải xử lý xe theo pháp
 * luật, garage phải chứng minh đã nỗ lực liên hệ. Bảng ở database chỉ cho THÊM,
 * không cho sửa hay xoá — sửa được một lần gọi đã ghi thì toàn bộ giá trị làm
 * chứng biến mất.
 */
export const LogContactInput = z
  .object({
    channel: ContactChannel,
    outcome: ContactOutcome,
    promisedPickupAt: z.string().datetime({ offset: true }).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((d) => d.outcome !== 'PROMISED_DATE' || d.promisedPickupAt !== undefined, {
    message: 'Khách hẹn ngày thì phải ghi rõ ngày nào',
    path: ['promisedPickupAt'],
  })
  .refine(
    (d) => d.channel !== 'REGISTERED_MAIL' || (d.note ?? '').trim().length >= 10,
    {
      message: 'Thư bảo đảm phải ghi rõ gửi tới địa chỉ nào, theo số vận đơn nào',
      path: ['note'],
    },
  );
export type LogContactInput = z.infer<typeof LogContactInput>;

export const ContactAttempt = z.object({
  id: z.string().uuid(),
  attemptedAt: z.string(),
  attemptedByName: z.string(),
  channel: ContactChannel,
  outcome: ContactOutcome,
  promisedPickupAt: z.string().nullable(),
  note: z.string().nullable(),
});
export type ContactAttempt = z.infer<typeof ContactAttempt>;

/** Một chiếc xe đang nằm chờ người tới lấy */
export const AbandonedVehicle = z.object({
  repairOrderId: z.string().uuid(),
  code: z.string(),
  plateNumber: z.string(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  readyForDeliveryAt: z.string(),
  soNgayCho: z.number().int(),
  abandonmentStatus: AbandonmentStatus,
  lastContactAttemptAt: z.string().nullable(),
  soLanLienHe: z.number().int(),
  legalHold: z.boolean(),
  movedToStorageAt: z.string().nullable(),
  /** Phí lưu bãi còn phải thu (đã trừ phần được miễn) */
  phiLuuBai: z.number().int(),
});
export type AbandonedVehicle = z.infer<typeof AbandonedVehicle>;

export const StorageFee = z.object({
  id: z.string().uuid(),
  repairOrderId: z.string().uuid(),
  perDayAmount: z.number().int(),
  graceDays: z.number().int(),
  maxAmount: z.number().int(),
  tinhTu: z.string(),
  tinhDen: z.string(),
  soNgay: z.number().int(),
  amount: z.number().int(),
  waivedAmount: z.number().int(),
  waivedReason: z.string().nullable(),
  /** Đã báo cho khách biết có khoản phí này chưa — không báo thì không có cơ sở thu */
  thongBaoLuc: z.string().nullable(),
  /** `amount − waivedAmount` */
  conPhaiThu: z.number().int(),
});
export type StorageFee = z.infer<typeof StorageFee>;

export const WaiveStorageFeeInput = z.object({
  amount: moneyAmount,
  reason: z.string().trim().min(5, 'Ghi rõ vì sao miễn').max(500),
});
export type WaiveStorageFeeInput = z.infer<typeof WaiveStorageFeeInput>;

/**
 * Đánh dấu xe đang tranh chấp — BC-15 mục 6.3.
 *
 * 🔒 Phần mềm KHÔNG giải quyết tranh chấp sở hữu. Nó làm đúng một việc: chặn
 * bàn giao cho tới khi có người tường minh gỡ cờ.
 */
export const SetLegalHoldInput = z.object({
  legalHold: z.boolean(),
  reason: z.string().trim().min(5, 'Ghi rõ vì sao giữ xe lại').max(500),
});
export type SetLegalHoldInput = z.infer<typeof SetLegalHoldInput>;
