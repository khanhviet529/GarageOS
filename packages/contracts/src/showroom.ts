import { z } from 'zod';
import { Powertrain } from './vehicle.js';

/**
 * Catalog thương mại — giá lăn bánh, trả góp, ưu đãi, màu, tồn theo chi nhánh.
 *
 * SRS-LS-EXP-001 §4. Ranh giới đã chốt: **hiển thị ≠ giao dịch**. Mọi thứ ở đây
 * là để khách hình dung một con số; không có gì trong file này mô tả một khoản
 * thu, một hồ sơ vay hay một cam kết.
 */

/** Tỷ lệ lưu bằng basis point — 1 bp = 0,01 %. Không bao giờ dùng float cho tiền. */
export const BasisPoint = z.number().int().min(0).max(10_000);
export type BasisPoint = z.infer<typeof BasisPoint>;

const amount = z.number().int().nonnegative();
const positiveAmount = z.number().int().positive();


/* ========================== Biểu phí lăn bánh (§4.1) ========================= */

export const OnroadFeeScheduleInput = z.object({
  provinceCode: z.string().trim().regex(/^[0-9]{2,3}$/, 'Mã tỉnh là 2–3 chữ số'),
  provinceName: z.string().trim().min(1).max(120),
  powertrain: Powertrain,
  registrationFeeRateBp: BasisPoint,
  plateFeeAmount: amount,
  inspectionFeeAmount: amount,
  roadMaintenanceFeeAmount: amount,
  civilInsuranceFeeAmount: amount,
  /** Bảo hiểm vật chất — tự nguyện, hiển thị SAU tổng, mặc định không cộng vào. */
  materialInsuranceRateBp: BasisPoint.default(0),
  dealerFeeAmount: amount.default(0),
  dealerFeeLabel: z.string().trim().max(120).nullable().optional(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.dealerFeeAmount > 0 && !value.dealerFeeLabel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dealerFeeLabel'],
      message: 'Phụ phí đại lý phải có tên riêng — không núp dưới tên "đăng kiểm"',
    });
  }
  if (value.effectiveTo && value.effectiveTo <= value.effectiveFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['effectiveTo'],
      message: 'Ngày hết hiệu lực phải sau ngày hiệu lực',
    });
  }
});
export type OnroadFeeScheduleInput = z.infer<typeof OnroadFeeScheduleInput>;

/* =============================== Màu xe (§4.4) ============================== */

export const VehicleColorKind = z.enum(['DON', 'KIM_LOAI', 'DAC_BIET']);
export type VehicleColorKind = z.infer<typeof VehicleColorKind>;

export const VEHICLE_COLOR_KIND_LABEL: Record<VehicleColorKind, string> = {
  DON: 'Màu đơn',
  KIM_LOAI: 'Kim loại',
  DAC_BIET: 'Đặc biệt',
};

export const VehicleColorInput = z.object({
  name: z.string().trim().min(1).max(80),
  hexCode: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Mã màu dạng #rrggbb'),
  kind: VehicleColorKind.default('DON'),
  surchargeAmount: amount.default(0),
  displayOrder: z.number().int().min(0).max(10_000).default(0),
});
export type VehicleColorInput = z.infer<typeof VehicleColorInput>;

/* =============================== Ưu đãi (§4.2) ============================== */

export const PromotionKind = z.enum(['GIAM_TIEN', 'QUA_TANG', 'HO_TRO_PHI']);
export type PromotionKind = z.infer<typeof PromotionKind>;

export const PROMOTION_KIND_LABEL: Record<PromotionKind, string> = {
  GIAM_TIEN: 'Giảm tiền',
  QUA_TANG: 'Quà tặng',
  HO_TRO_PHI: 'Hỗ trợ phí',
};

/**
 * Bốn trạng thái, ba trong số đó là SUY RA từ thời gian — không lưu.
 *
 * 🔒 `DA_TAT` và `HET_HAN` là hai chuyện khác nhau: một cái là quyết định của
 * người, một cái là mệnh lệnh của đồng hồ. Gộp lại thì biên tập viên không biết
 * ưu đãi biến mất vì ai.
 */
export const PromotionState = z.enum(['DANG_CHAY', 'DA_HEN', 'HET_HAN', 'DA_TAT']);
export type PromotionState = z.infer<typeof PromotionState>;

export const PROMOTION_STATE_LABEL: Record<PromotionState, string> = {
  DANG_CHAY: 'Đang chạy',
  DA_HEN: 'Đã hẹn',
  HET_HAN: 'Hết hạn',
  DA_TAT: 'Đã tắt',
};

export const VehiclePromotionInput = z.object({
  variantId: z.string().uuid().nullable().optional(),
  kind: PromotionKind,
  title: z.string().trim().min(1).max(160),
  conditionText: z.string().trim().max(500).nullable().optional(),
  valueAmount: positiveAmount.nullable().optional(),
  isEnabled: z.boolean().default(true),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  displayOrder: z.number().int().min(0).max(10_000).default(0),
}).superRefine((value, ctx) => {
  if (value.kind !== 'QUA_TANG' && (value.valueAmount ?? null) === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['valueAmount'],
      message: 'Ưu đãi giảm tiền hoặc hỗ trợ phí phải có giá trị bằng tiền',
    });
  }
  if (value.endsAt && value.endsAt <= value.startsAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'Ngày kết thúc phải sau ngày bắt đầu' });
  }
});
export type VehiclePromotionInput = z.infer<typeof VehiclePromotionInput>;

/* ============================ Trả góp (§4.3) ================================ */

export const FinancingProgramInput = z.object({
  bankName: z.string().trim().min(1).max(120),
  bankLogoMediaId: z.string().uuid().nullable().optional(),
  minDownPaymentBp: BasisPoint,
  promoRateBp: BasisPoint,
  promoMonths: z.number().int().min(0).max(120),
  standardRateBp: BasisPoint,
  allowedTermsMonths: z.array(z.number().int().min(6).max(120)).min(1).max(12),
  downPaymentOptionsBp: z.array(BasisPoint).min(1).max(8),
  rateUpdatedAt: z.string().date(),
  displayOrder: z.number().int().min(0).max(10_000).default(0),
});
export type FinancingProgramInput = z.infer<typeof FinancingProgramInput>;

/* ========================= Tồn và giao xe (§4.5) ============================ */

export const AvailabilityStatus = z.enum(['SAN_XE', 'SAP_VE', 'DAT_HANG', 'TAM_NGUNG']);
export type AvailabilityStatus = z.infer<typeof AvailabilityStatus>;

export const AVAILABILITY_STATUS_LABEL: Record<AvailabilityStatus, string> = {
  SAN_XE: 'Sẵn xe',
  SAP_VE: 'Sắp về',
  DAT_HANG: 'Đặt hàng',
  TAM_NGUNG: 'Tạm ngừng',
};

export const VehicleAvailabilityInput = z.object({
  branchId: z.string().uuid(),
  status: AvailabilityStatus,
  leadTimeDaysMin: z.number().int().min(0).max(365).nullable().optional(),
  leadTimeDaysMax: z.number().int().min(0).max(365).nullable().optional(),
  availableVariantIds: z.array(z.string().uuid()).max(20).default([]),
  availableColorIds: z.array(z.string().uuid()).max(20).default([]),
  note: z.string().trim().max(300).nullable().optional(),
}).superRefine((value, ctx) => {
  const hasMin = (value.leadTimeDaysMin ?? null) !== null;
  const hasMax = (value.leadTimeDaysMax ?? null) !== null;
  if (hasMin !== hasMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['leadTimeDaysMax'], message: 'Khai cả hai đầu của khoảng thời gian giao, hoặc không khai đầu nào' });
    return;
  }
  if (hasMin && value.leadTimeDaysMax! < value.leadTimeDaysMin!) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['leadTimeDaysMax'], message: 'Mốc cuối phải lớn hơn hoặc bằng mốc đầu' });
  }
  if (value.status === 'SAN_XE' && hasMin) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['leadTimeDaysMin'], message: 'Sẵn xe thì không khai thời gian chờ — hai phát biểu mâu thuẫn trên cùng một dòng' });
  }
  if ((value.status === 'SAP_VE' || value.status === 'DAT_HANG') && !hasMin) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['leadTimeDaysMin'], message: 'Sắp về hoặc đặt hàng thì phải cho khách biết bao lâu' });
  }
});
export type VehicleAvailabilityInput = z.infer<typeof VehicleAvailabilityInput>;

/* ========================== Nhật ký giá (§4.6) ============================== */

export const PriceChangeInput = z.object({
  variantId: z.string().uuid(),
  newAmount: positiveAmount.nullable(),
  /**
   * 🔒 Bắt buộc. Nhật ký chỉ trả lời được "ai đổi" là nhật ký để trưng bày —
   * câu người ta hỏi khi giá sai là "vì sao đổi".
   */
  reason: z.string().trim().min(3, 'Lý do đổi giá là bắt buộc').max(300),
});
export type PriceChangeInput = z.infer<typeof PriceChangeInput>;

/* ========================= Kiểu trả về cho bề mặt =========================== */

/** Một dòng trong bảng bóc giá lăn bánh. `insideTotal=false` nằm SAU tổng. */
export interface OnroadFeeLine {
  key: string;
  label: string;
  amount: bigint;
  insideTotal: boolean;
}

export interface OnroadPriceBreakdown {
  lines: OnroadFeeLine[];
  /** Tổng lăn bánh — chỉ cộng các dòng `insideTotal`. */
  total: bigint;
  /** Nguồn của con số, để hiện kèm nhãn ước tính — INV-LS-16. */
  source: { provinceName: string; effectiveFrom: string; powertrain: Powertrain };
}

/** Một đoạn kỳ trả góp có cùng số tiền hàng tháng. */
export interface FinancingPhase {
  fromPeriod: number;
  toPeriod: number;
  monthlyAmount: bigint;
  annualRateBp: number;
}

export interface FinancingQuote {
  principal: bigint;
  downPayment: bigint;
  termMonths: number;
  phases: FinancingPhase[];
  totalPaid: bigint;
  totalInterest: bigint;
}

/* ==================== Thư viện chương trình trả góp (§4.3) =================== */

/**
 * Mẫu chương trình trả góp dùng chung cả tenant.
 *
 * 🔒 Mẫu là NGUỒN ĐỂ CHÉP, không phải nguồn để đọc lúc hiển thị. Cho trang xe
 *    đọc thẳng lãi suất từ mẫu sẽ vi phạm `INV-LS-13`: sửa lãi suất trong thư
 *    viện đổi con số trên mọi trang đã xuất bản, không qua một lần publish nào.
 *    Với con số khách in ra mang tới ngân hàng thì đó là hỏng, không phải tiện.
 *
 * Chi tiết đánh đổi ghi ở đầu migration 0081.
 */
export const FinancingTemplateInput = FinancingProgramInput.extend({
  isActive: z.boolean().default(true),
});
export type FinancingTemplateInput = z.infer<typeof FinancingTemplateInput>;

export const FinancingTemplateRow = FinancingTemplateInput.extend({
  id: z.string().uuid(),
  version: z.number().int(),
  /** Số mẫu xe đang dùng bản chép của mẫu này. */
  usedByCount: z.number().int(),
  /** Trong số đó, bao nhiêu bản chép đã LỆCH so với mẫu hiện tại. */
  driftCount: z.number().int(),
});
export type FinancingTemplateRow = z.infer<typeof FinancingTemplateRow>;

/** Một mẫu xe đang chào bản chép đã lệch so với thư viện. */
export const FinancingDriftRow = z.object({
  productId: z.string().uuid(),
  productSlug: z.string(),
  revisionId: z.string().uuid(),
  /** `true` khi bản lệch nằm ở bản ĐÃ PUBLISH — tức là khách đang thấy số cũ. */
  published: z.boolean(),
  templateId: z.string().uuid(),
  bankName: z.string(),
});
export type FinancingDriftRow = z.infer<typeof FinancingDriftRow>;
