import { z } from 'zod';
import { moneyAmount } from './money.js';

/**
 * Hoá đơn, thanh toán, công nợ, bảo hiểm — Phase 3 (BC-07 · BC-08 · BC-13).
 *
 * 💡 Nguyên tắc cốt lõi nằm ngay ở hình dạng của `BuildInvoiceInput`: nó KHÔNG
 * nhận dòng nào cả. Hoá đơn lập từ CÔNG VIỆC ĐÃ THỰC HIỆN — service đọc
 * `work_assignment` đã QC_PASSED và `stock_movement` đã xuất, rồi tự dựng.
 *
 * Cho client gửi dòng lên là mở đường cho một hoá đơn không khớp với bất kỳ
 * chứng từ nào, và đó đúng là thứ BC-07 nói sẽ làm sai cùng lúc ba con số:
 * doanh thu, tồn kho, giá vốn.
 */

export const InvoiceStatus = z.enum([
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'ADJUSTED',
  'CANCELLED',
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Nháp',
  ISSUED: 'Đã phát hành',
  PARTIALLY_PAID: 'Đã thu một phần',
  PAID: 'Đã thu đủ',
  ADJUSTED: 'Đã điều chỉnh',
  CANCELLED: 'Đã huỷ',
};

export const InvoiceLineType = z.enum(['LABOR', 'PART', 'FEE']);
export type InvoiceLineType = z.infer<typeof InvoiceLineType>;

export const PayerType = z.enum(['CUSTOMER', 'INSURER', 'WARRANTY']);
export type PayerType = z.infer<typeof PayerType>;

export const PAYER_TYPE_LABEL: Record<PayerType, string> = {
  CUSTOMER: 'Khách hàng',
  INSURER: 'Công ty bảo hiểm',
  WARRANTY: 'Bảo hành (garage chịu)',
};

export const PaymentMethod = z.enum(['CASH', 'TRANSFER', 'CARD', 'CREDIT']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Tiền mặt',
  TRANSFER: 'Chuyển khoản',
  CARD: 'Quẹt thẻ',
  CREDIT: 'Ghi công nợ',
};

export const InvoiceLine = z.object({
  id: z.string().uuid(),
  seq: z.number().int(),
  lineType: InvoiceLineType,
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number().int(),
  discountAmount: z.number().int(),
  taxRatePercent: z.number().int(),
  grossAmount: z.number().int(),
  taxAmount: z.number().int(),
  lineTotal: z.number().int(),
  isWarranty: z.boolean(),
  expectedPayerType: PayerType,
  /** Dòng báo giá sinh ra khoản này — cơ sở của bảng đối chiếu BR-09-3 */
  sourceQuotationLineId: z.string().uuid().nullable(),
  /** Đã thu được bao nhiêu cho riêng dòng này */
  daThu: z.number().int(),
});
export type InvoiceLine = z.infer<typeof InvoiceLine>;

/**
 * Một dòng của bảng đối chiếu báo giá ↔ thực tế — BC-07 mục 3.
 *
 * 🔒 Bảng này BẮT BUỘC hiện trước khi phát hành. Không có nó, chênh lệch lớn
 * lọt qua và khách bất ngờ lúc thanh toán — thời điểm tệ nhất để tranh cãi.
 */
export const ReconciliationRow = z.object({
  description: z.string(),
  /** Số tiền đã báo giá; 0 nghĩa là hạng mục phát sinh sau */
  baoGia: z.number().int(),
  /** Số tiền thực tế trên hoá đơn; 0 nghĩa là đã báo mà không làm */
  thucTe: z.number().int(),
  chenhLech: z.number().int(),
  lyDo: z.string(),
});
export type ReconciliationRow = z.infer<typeof ReconciliationRow>;

export const InvoiceReconciliation = z.object({
  rows: z.array(ReconciliationRow),
  tongBaoGia: z.number().int(),
  tongThucTe: z.number().int(),
  chenhLech: z.number().int(),
  chenhLechPhanTram: z.number(),
  nguongPhanTram: z.number(),
  /** 🔒 BR-09-3 — vượt ngưỡng thì phải giải trình mới cho phát hành */
  vuotNguong: z.boolean(),
});
export type InvoiceReconciliation = z.infer<typeof InvoiceReconciliation>;

export const Invoice = z.object({
  id: z.string().uuid(),
  code: z.string(),
  repairOrderId: z.string().uuid(),
  repairOrderCode: z.string(),
  customerId: z.string().uuid(),
  customerName: z.string(),
  status: InvoiceStatus,
  subtotalAmount: z.number().int(),
  discountAmount: z.number().int(),
  taxAmount: z.number().int(),
  totalAmount: z.number().int(),
  daThu: z.number().int(),
  conNo: z.number().int(),
  issuedAt: z.string().nullable(),
  dueDate: z.string().nullable(),
  varianceReason: z.string().nullable(),
  adjustmentOfInvoiceId: z.string().uuid().nullable(),
  adjustmentReason: z.string().nullable(),
  lines: z.array(InvoiceLine),
  reconciliation: InvoiceReconciliation,
});
export type Invoice = z.infer<typeof Invoice>;

/**
 * Dựng hoá đơn nháp từ công việc thực tế.
 *
 * 🔒 Không có trường `lines`. Xem ghi chú đầu file.
 */
export const BuildInvoiceInput = z.object({
  repairOrderId: z.string().uuid(),
});
export type BuildInvoiceInput = z.infer<typeof BuildInvoiceInput>;

export const IssueInvoiceInput = z.object({
  /** 🔒 BR-09-3 — bắt buộc khi chênh lệch vượt ngưỡng của tenant */
  varianceReason: z.string().trim().min(10, 'Giải trình phải nói rõ vì sao lệch').max(1000).optional(),
  /** Ghi công nợ thay vì thu ngay — chỉ khách doanh nghiệp có hạn mức */
  ghiCongNo: z.boolean().default(false),
});
export type IssueInvoiceInput = z.infer<typeof IssueInvoiceInput>;

/**
 * Hoá đơn điều chỉnh — BC-07 mục 6.1.
 *
 * 🔒 Các dòng chỉ ghi PHẦN CHÊNH LỆCH, và chênh lệch có thể âm. Hoá đơn gốc
 * giữ nguyên nội dung, chuyển sang `ADJUSTED`.
 */
export const AdjustInvoiceInput = z.object({
  reason: z.string().trim().min(10, 'Ghi rõ sai ở đâu').max(1000),
  lines: z
    .array(
      z.object({
        lineType: InvoiceLineType,
        description: z.string().trim().min(3).max(300),
        quantity: z.number().positive(),
        unitPrice: z.number().int(),
        taxRatePercent: z.number().int().min(0).max(100).default(0),
      }),
    )
    .min(1, 'Hoá đơn điều chỉnh phải có ít nhất một dòng'),
});
export type AdjustInvoiceInput = z.infer<typeof AdjustInvoiceInput>;

/**
 * Ghi nhận một khoản thu.
 *
 * 🔧 F-01 — gắn với KHÁCH, không gắn với hoá đơn. Một lần chuyển khoản trả cho
 * nhiều hoá đơn, nên quan hệ tới hoá đơn nằm ở `allocations`.
 */
export const RecordPaymentInput = z.object({
  customerId: z.string().uuid(),
  payerType: PayerType.default('CUSTOMER'),
  payerName: z.string().trim().max(200).optional(),
  amount: moneyAmount,
  method: PaymentMethod,
  reference: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
  /**
   * 🔒 Khoá chống ghi trùng. Thu ngân bấm hai lần vì mạng chậm là chuyện hằng
   * ngày, và hậu quả là số tiền đã thu sai gấp đôi.
   */
  idempotencyKey: z.string().trim().min(8).max(100),
  /**
   * 🔒 Phân bổ tới TỪNG DÒNG hoá đơn — BC-08.
   *
   * Tổng phân bổ phải bằng `amount` (INV-M-05); database kiểm ở cuối giao dịch.
   */
  allocations: z
    .array(
      z.object({
        invoiceLineId: z.string().uuid(),
        amount: moneyAmount,
      }),
    )
    .min(1, 'Phải phân bổ khoản thu vào ít nhất một dòng hoá đơn'),
});
export type RecordPaymentInput = z.infer<typeof RecordPaymentInput>;

/** Chứng từ đảo — chứng từ tài chính không sửa, không xoá */
export const ReversePaymentInput = z.object({
  reason: z.string().trim().min(5, 'Ghi rõ vì sao đảo').max(500),
  idempotencyKey: z.string().trim().min(8).max(100),
});
export type ReversePaymentInput = z.infer<typeof ReversePaymentInput>;

export const Payment = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  payerType: PayerType,
  payerName: z.string().nullable(),
  amount: z.number().int(),
  method: PaymentMethod,
  paidAt: z.string(),
  reference: z.string().nullable(),
  reversalOfPaymentId: z.string().uuid().nullable(),
  allocations: z.array(
    z.object({
      invoiceLineId: z.string().uuid(),
      invoiceCode: z.string(),
      description: z.string(),
      amount: z.number().int(),
    }),
  ),
});
export type Payment = z.infer<typeof Payment>;

/** Công nợ theo tuổi nợ — R-F-03 */
export const CustomerDebt = z.object({
  customerId: z.string().uuid(),
  displayName: z.string(),
  type: z.string(),
  creditLimitAmount: z.number().int(),
  paymentTermDays: z.number().int(),
  tongConNo: z.number().int(),
  quaHan: z.number().int(),
  quaHanLauNhat: z.number().int(),
  soHoaDonChuaThu: z.number().int(),
  /** Chia theo tuổi nợ — R-F-03 */
  trongHan: z.number().int(),
  quaHan1_30: z.number().int(),
  quaHan31_60: z.number().int(),
  quaHanTren60: z.number().int(),
  /** Còn cho nợ được nữa không */
  conHanMuc: z.number().int(),
  creditOnHold: z.boolean(),
});
export type CustomerDebt = z.infer<typeof CustomerDebt>;

/* ── Bảo hiểm — BC-08 ─────────────────────────────────────────────────────── */

export const InsuranceClaimStatus = z.enum([
  'DRAFT',
  'SUBMITTED',
  'SURVEYED',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED',
  'SETTLED',
  'CANCELLED',
]);
export type InsuranceClaimStatus = z.infer<typeof InsuranceClaimStatus>;

export const INSURANCE_CLAIM_STATUS_LABEL: Record<InsuranceClaimStatus, string> = {
  DRAFT: 'Mới khai báo',
  SUBMITTED: 'Đã gửi hồ sơ',
  SURVEYED: 'Đã giám định',
  APPROVED: 'Bảo hiểm duyệt toàn bộ',
  PARTIALLY_APPROVED: 'Bảo hiểm duyệt một phần',
  REJECTED: 'Bảo hiểm từ chối',
  SETTLED: 'Bảo hiểm đã chuyển tiền',
  CANCELLED: 'Đã huỷ',
};

export const CreateClaimInput = z.object({
  repairOrderId: z.string().uuid(),
  insurerName: z.string().trim().min(2).max(200),
  policyNumber: z.string().trim().min(3).max(100),
  /** 🔒 Mức khấu trừ khách chịu, dù hạng mục thuộc phạm vi bảo hiểm */
  deductibleAmount: moneyAmount.default(0),
});
export type CreateClaimInput = z.infer<typeof CreateClaimInput>;

export const UpdateClaimInput = z.object({
  status: InsuranceClaimStatus,
  claimNumber: z.string().trim().max(100).optional(),
  approvedAmount: moneyAmount.optional(),
  rejectionReason: z.string().trim().max(1000).optional(),
});
export type UpdateClaimInput = z.infer<typeof UpdateClaimInput>;

export const InsuranceClaim = z.object({
  id: z.string().uuid(),
  repairOrderId: z.string().uuid(),
  repairOrderCode: z.string(),
  insurerName: z.string(),
  policyNumber: z.string(),
  claimNumber: z.string().nullable(),
  deductibleAmount: z.number().int(),
  approvedAmount: z.number().int().nullable(),
  status: InsuranceClaimStatus,
  rejectionReason: z.string().nullable(),
  submittedAt: z.string().nullable(),
  settledAt: z.string().nullable(),
});
export type InsuranceClaim = z.infer<typeof InsuranceClaim>;

/* ── Hoá đơn điện tử — ADR-0005 ───────────────────────────────────────────── */

export const EInvoiceStatus = z.enum(['PENDING', 'ISSUED', 'FAILED', 'CANCELLED']);
export type EInvoiceStatus = z.infer<typeof EInvoiceStatus>;

export const EInvoice = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  provider: z.string(),
  providerInvoiceNo: z.string().nullable(),
  taxAuthorityCode: z.string().nullable(),
  status: EInvoiceStatus,
  errorMessage: z.string().nullable(),
  attemptCount: z.number().int(),
  issuedAt: z.string().nullable(),
});
export type EInvoice = z.infer<typeof EInvoice>;
