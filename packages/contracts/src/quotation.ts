import { z } from 'zod';
import { boundedInt, moneyAmount } from './money.js';

export const QuotationStatus = z.enum([
  'DRAFT',
  'SENT',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED',
  'EXPIRED',
  'SUPERSEDED',
]);
export type QuotationStatus = z.infer<typeof QuotationStatus>;

export const QuotationLineStatus = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export type QuotationLineStatus = z.infer<typeof QuotationLineStatus>;

export const LineType = z.enum(['LABOR', 'PART']);
export type LineType = z.infer<typeof LineType>;

/**
 * Thêm một dòng vào báo giá.
 *
 * Hai hình thái loại trừ nhau:
 *  - LABOR: chọn từ danh mục hạng mục. Giá công lấy theo giờ định mức × đơn giá
 *    giờ đã snapshot trên báo giá — KHÔNG cho client gửi giá lên.
 *  - PART: chọn từ danh mục phụ tùng, phải trỏ về dòng công đã dùng nó
 *    (🔒 INV-Q-02).
 */
export const AddQuotationLineInput = z
  .object({
    lineType: LineType,
    serviceItemId: z.string().uuid().optional(),
    partId: z.string().uuid().optional(),
    parentLineId: z.string().uuid().optional(),
    /** Số lượng — giờ công có thể lẻ (1,5h), phụ tùng có thể lẻ (4,8 lít) */
    quantity: z.number().positive().max(100_000),
    discountAmount: moneyAmount.default(0),
    taxRatePercent: boundedInt(100, 'Thuế suất không hợp lệ').default(10),
    /** Hạng mục bảo hành: khách không trả tiền, dòng tính 0đ */
    isWarranty: z.boolean().default(false),
    /** Ghi đè mô tả — mặc định lấy tên trong danh mục */
    description: z.string().trim().min(2).max(500).optional(),
  })
  .refine(
    (d) =>
      d.lineType === 'LABOR'
        ? d.serviceItemId !== undefined && d.partId === undefined
        : d.partId !== undefined && d.serviceItemId === undefined,
    { message: 'Dòng công phải chọn hạng mục, dòng phụ tùng phải chọn phụ tùng' },
  )
  .refine((d) => d.lineType === 'PART' || d.parentLineId === undefined, {
    message: 'Chỉ dòng phụ tùng mới có dòng công cha',
    path: ['parentLineId'],
  });
export type AddQuotationLineInput = z.infer<typeof AddQuotationLineInput>;

export const QuotationLine = z.object({
  id: z.string().uuid(),
  seq: z.number().int(),
  lineType: LineType,
  parentLineId: z.string().uuid().nullable(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number().int(),
  discountAmount: z.number().int(),
  taxRatePercent: z.number().int(),
  lineTotal: z.number().int(),
  status: QuotationLineStatus,
  rejectReason: z.string().nullable(),
  isWarranty: z.boolean(),
});
export type QuotationLine = z.infer<typeof QuotationLine>;

export const Quotation = z.object({
  id: z.string().uuid(),
  repairOrderId: z.string().uuid(),
  seq: z.number().int(),
  status: QuotationStatus,
  laborRatePerHour: z.number().int(),
  subtotalAmount: z.number().int(),
  discountAmount: z.number().int(),
  taxAmount: z.number().int(),
  totalAmount: z.number().int(),
  validUntil: z.string().nullable(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
  lines: z.array(QuotationLine),
});
export type Quotation = z.infer<typeof Quotation>;

export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  DRAFT: 'Nháp',
  SENT: 'Đã gửi khách',
  APPROVED: 'Khách duyệt toàn bộ',
  PARTIALLY_APPROVED: 'Khách duyệt một phần',
  REJECTED: 'Khách từ chối',
  EXPIRED: 'Hết hạn',
  SUPERSEDED: 'Đã bị thay thế',
};

export const QUOTATION_LINE_STATUS_LABEL: Record<QuotationLineStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
};
