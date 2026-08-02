import { z } from 'zod';
import { boundedInt } from './money.js';

/** 🔒 Khớp enum `repair_order_status` trong DB — docs/06-state-machines.md */
export const RepairOrderStatus = z.enum([
  'RECEIVED',
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
]);
export type RepairOrderStatus = z.infer<typeof RepairOrderStatus>;

/**
 * Lý do số km lùi — 🔒 INV-V-04.
 *
 * Bắt buộc CHỌN từ danh sách, không cho gõ tự do: lý do gõ tay không thống kê
 * được, mà mục đích chính của trường này là phát hiện gian lận có hệ thống.
 */
export const OdometerOverrideReason = z.enum([
  'ODOMETER_REPLACED',   // thay cụm đồng hồ
  'PREVIOUS_ENTRY_WRONG', // lần trước nhập sai
  'OTHER',
]);
export type OdometerOverrideReason = z.infer<typeof OdometerOverrideReason>;

const odometer = boundedInt(5_000_000, 'Số km không hợp lệ');

export const CreateRepairOrderInput = z
  .object({
    vehicleId: z.string().uuid(),
    branchId: z.string().uuid(),

    // 🔒 NGUYÊN VĂN lời khách. Cố vấn diễn giải sớm là thợ chẩn đoán sai hướng
    //    (BC-01 mục 6) — nên trường này dài và bắt buộc.
    customerComplaint: z.string().trim().min(3).max(2000),

    odometerIn: odometer.optional(),
    /** Đồng hồ hỏng, không đọc được số km */
    odometerUnavailable: z.boolean().default(false),
    odometerOverrideReason: OdometerOverrideReason.optional(),

    /** % pin (BEV/HYBRID) hoặc vạch xăng quy đổi (ICE) */
    energyLevelIn: z.number().int().min(0).max(100).optional(),

    promisedAt: z.string().datetime().optional(),

    // BC-13: người mang xe đến có thể là tài xế, không phải chủ xe
    broughtByName: z.string().trim().max(200).optional(),
    broughtByPhone: z.string().trim().max(15).optional(),

    /** Tài sản trên xe — túi xách, giấy tờ, đồ dùng (BC-01 bước 7) */
    assets: z
      .array(z.object({ description: z.string().trim().min(2).max(500) }))
      .max(50)
      .default([]),
  })
  .refine((d) => !d.odometerUnavailable || d.odometerIn === undefined, {
    message: 'Đã đánh dấu không đọc được số km thì không nhập số km',
    path: ['odometerIn'],
  })
  .refine((d) => d.odometerUnavailable || d.odometerIn !== undefined, {
    message: 'Phải nhập số km, hoặc đánh dấu đồng hồ không đọc được',
    path: ['odometerIn'],
  });
export type CreateRepairOrderInput = z.infer<typeof CreateRepairOrderInput>;

export const RepairOrderAsset = z.object({
  id: z.string().uuid(),
  description: z.string(),
  returnedAt: z.string().nullable(),
  returnedToName: z.string().nullable(),
});
export type RepairOrderAsset = z.infer<typeof RepairOrderAsset>;

export const RepairOrderPhoto = z.object({
  id: z.string().uuid(),
  phase: z.string(),
  storageKey: z.string(),
  caption: z.string().nullable(),
  takenAt: z.string(),
});
export type RepairOrderPhoto = z.infer<typeof RepairOrderPhoto>;

export const RepairOrderDetail = z.object({
  id: z.string().uuid(),
  code: z.string(),
  status: RepairOrderStatus,
  customerComplaint: z.string(),
  odometerIn: z.number().nullable(),
  odometerUnavailable: z.boolean(),
  odometerOverrideReason: z.string().nullable(),
  energyLevelIn: z.number().nullable(),
  receivedAt: z.string(),
  promisedAt: z.string().nullable(),
  broughtByName: z.string().nullable(),
  broughtByPhone: z.string().nullable(),
  /**
   * 🔒 Chỉ trả cho người dùng NỘI BỘ. Đây là chìa khoá trang tra cứu công khai;
   * lộ ra ngoài là lộ báo giá của khách.
   */
  customerAccessToken: z.string(),
  vehicle: z.object({
    id: z.string().uuid(),
    plateNumber: z.string(),
    powertrain: z.enum(['ICE', 'HYBRID', 'BEV']),
    makeName: z.string().nullable(),
    modelName: z.string().nullable(),
  }),
  customer: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
    phone: z.string(),
  }),
  assets: z.array(RepairOrderAsset),
  photos: z.array(RepairOrderPhoto),
});
export type RepairOrderDetail = z.infer<typeof RepairOrderDetail>;

export const RepairOrderListItem = z.object({
  id: z.string().uuid(),
  code: z.string(),
  status: RepairOrderStatus,
  plateNumber: z.string(),
  powertrain: z.enum(['ICE', 'HYBRID', 'BEV']),
  customerName: z.string(),
  customerComplaint: z.string(),
  receivedAt: z.string(),
});
export type RepairOrderListItem = z.infer<typeof RepairOrderListItem>;

/** Nhãn tiếng Việt của trạng thái — dùng chung web và mobile */
export const REPAIR_ORDER_STATUS_LABEL: Record<RepairOrderStatus, string> = {
  RECEIVED: 'Đã tiếp nhận',
  DIAGNOSING: 'Đang kiểm tra',
  QUOTED: 'Đã lập báo giá',
  AWAITING_APPROVAL: 'Chờ khách duyệt',
  AWAITING_PARTS: 'Chờ phụ tùng',
  IN_PROGRESS: 'Đang sửa',
  QUALITY_CHECK: 'Đang kiểm tra chất lượng',
  AWAITING_PAYMENT: 'Chờ thanh toán',
  AWAITING_DELIVERY: 'Chờ giao xe',
  DELIVERED: 'Đã giao xe',
  CANCELLED: 'Đã huỷ',
};

export const ODOMETER_OVERRIDE_REASON_LABEL: Record<OdometerOverrideReason, string> = {
  ODOMETER_REPLACED: 'Đã thay cụm đồng hồ',
  PREVIOUS_ENTRY_WRONG: 'Lần trước nhập sai',
  OTHER: 'Lý do khác',
};
