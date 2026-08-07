import { z } from 'zod';
import { moneyAmount } from './money.js';

/** Khớp enum `coverage_type` — migration 0033 */
export const CoverageType = z.enum(['PART', 'LABOR']);
export type CoverageType = z.infer<typeof CoverageType>;

export const COVERAGE_TYPE_LABEL: Record<CoverageType, string> = {
  PART: 'Phụ tùng',
  LABOR: 'Công thợ',
};

/**
 * Một suất bảo hành còn hiệu lực của một chiếc xe.
 *
 * 🔒 INV-B-02 — hết hạn khi MỘT TRONG HAI mốc bị vượt, không phải cả hai.
 * `conHieuLuc` do database tính (hàm `bao_hanh_con_hieu_luc`), không tính lại ở
 * client: ba bản cài đặt của một điều kiện thì sớm muộn có một bản dùng `AND`
 * thay vì `OR`, và lỗi đó nghiêng về phía garage nên không ai phàn nàn cho tới
 * khi bị kiện.
 */
export const WarrantyCoverage = z.object({
  id: z.string().uuid(),
  quotationLineId: z.string().uuid(),
  description: z.string(),
  coverageType: CoverageType,
  /** Đơn gốc đã sinh ra suất bảo hành này */
  repairOrderId: z.string().uuid(),
  repairOrderCode: z.string(),
  startedAt: z.string(),
  startOdometer: z.number().int(),
  expiresAt: z.string(),
  expiresAtOdometer: z.number().int().nullable(),
  conHieuLuc: z.boolean(),
  /** Vì sao hết hiệu lực — để cố vấn giải thích được cho khách */
  lyDoHetHieuLuc: z.string().nullable(),
  claimedByRepairOrderId: z.string().uuid().nullable(),
});
export type WarrantyCoverage = z.infer<typeof WarrantyCoverage>;

/**
 * Sinh bảo hành khi BÀN GIAO xe — 🔒 INV-B-01.
 *
 * Không nhận `startedAt` hay `startOdometer` từ client: cả hai lấy từ chính đơn
 * (`delivered_at`, `odometer_out`). Cho client gửi lên là cho phép kéo dài hạn
 * bảo hành bằng một request.
 */
export const IssueWarrantyInput = z.object({
  repairOrderId: z.string().uuid(),
});
export type IssueWarrantyInput = z.infer<typeof IssueWarrantyInput>;

/**
 * Nhận một đơn bảo hành — BC-09 mục 3.
 *
 * `coverageIds` là những suất bảo hành cố vấn xác nhận áp dụng. Bắt chọn tường
 * minh chứ không tự suy: thợ phải xác nhận đúng là lỗi cũ tái phát (bước 6),
 * và việc đó không suy ra được từ dữ liệu.
 */
export const OpenWarrantyClaimInput = z.object({
  /** Đơn bảo hành vừa tiếp nhận */
  repairOrderId: z.string().uuid(),
  /** Đơn gốc chịu chi phí */
  originalRepairOrderId: z.string().uuid(),
  coverageIds: z.array(z.string().uuid()).min(1, 'Phải chọn ít nhất một suất bảo hành'),
});
export type OpenWarrantyClaimInput = z.infer<typeof OpenWarrantyClaimInput>;

/**
 * Ghi nhận đòi lại được từ nhà cung cấp — BC-09 mục 4, phương án bổ sung.
 *
 * Tách khỏi lúc tạo quy kết vì việc đòi diễn ra SAU, có khi vài tuần.
 */
export const RecordSupplierRecoveryInput = z.object({
  amount: moneyAmount,
  note: z.string().trim().min(5, 'Ghi rõ đòi được từ đâu, theo chứng từ nào').max(500),
});
export type RecordSupplierRecoveryInput = z.infer<typeof RecordSupplierRecoveryInput>;

export const WarrantyCostAttribution = z.object({
  id: z.string().uuid(),
  originalRepairOrderId: z.string().uuid(),
  originalRepairOrderCode: z.string(),
  warrantyRepairOrderId: z.string().uuid(),
  warrantyRepairOrderCode: z.string(),
  partCostAmount: z.number().int(),
  laborCostAmount: z.number().int(),
  recoveredFromSupplierAmount: z.number().int(),
  /** `partCost + laborCost − recovered` — cột SINH ở database */
  netCostAmount: z.number().int(),
  note: z.string().nullable(),
});
export type WarrantyCostAttribution = z.infer<typeof WarrantyCostAttribution>;
