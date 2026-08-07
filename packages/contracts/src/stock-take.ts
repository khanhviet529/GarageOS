import { z } from 'zod';

/**
 * Kiểm kê kho — BC-12.
 *
 * 🔒 Đây là đường DUY NHẤT làm tồn kho đổi mà không có chứng từ mua bán đối
 * ứng. Mọi thứ trong file này thiết kế theo hướng để lại dấu vết, không theo
 * hướng cho tiện.
 */

export const StockTakeStatus = z.enum([
  'DRAFT',
  'COUNTING',
  'PENDING_APPROVAL',
  'APPROVED',
  'CANCELLED',
]);
export type StockTakeStatus = z.infer<typeof StockTakeStatus>;

export const STOCK_TAKE_STATUS_LABEL: Record<StockTakeStatus, string> = {
  DRAFT: 'Nháp',
  COUNTING: 'Đang đếm',
  PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  CANCELLED: 'Đã huỷ',
};

/** Lý do chênh lệch — BC-12 mục 5. Phân loại này là dữ liệu quản trị thật. */
export const VarianceReason = z.enum([
  'COUNT_ERROR_PREVIOUS',
  'DAMAGED',
  'EXPIRED',
  'THEFT_SUSPECTED',
  'ISSUE_NOT_RECORDED',
  'RECEIPT_NOT_RECORDED',
  'OTHER',
]);
export type VarianceReason = z.infer<typeof VarianceReason>;

export const VARIANCE_REASON_LABEL: Record<VarianceReason, string> = {
  COUNT_ERROR_PREVIOUS: 'Lần kiểm kê trước đếm sai',
  DAMAGED: 'Hư hỏng trong kho',
  EXPIRED: 'Hết hạn sử dụng',
  THEFT_SUSPECTED: 'Nghi mất cắp',
  ISSUE_NOT_RECORDED: 'Xuất mà quên ghi sổ',
  RECEIPT_NOT_RECORDED: 'Nhập mà quên ghi sổ',
  OTHER: 'Khác — ghi rõ ở ghi chú',
};

/**
 * 💡 Mỗi lý do dẫn tới một hành động khác nhau. Màn hình hiện câu này ngay cạnh
 * ô chọn, để người đếm hiểu mình đang khai điều gì.
 */
export const VARIANCE_REASON_HINT: Record<VarianceReason, string> = {
  COUNT_ERROR_PREVIOUS: 'Không phát sinh chi phí — chỉ đính chính số cũ',
  DAMAGED: 'Ghi chi phí hao hụt; xem lại điều kiện bảo quản',
  EXPIRED: 'Ghi chi phí; xem lại mức tồn tối thiểu',
  THEFT_SUSPECTED: 'Báo cáo lên chủ xưởng và rà lại kiểm soát ra vào kho',
  ISSUE_NOT_RECORDED: 'Vấn đề QUY TRÌNH xuất kho, không phải lỗi người đếm',
  RECEIPT_NOT_RECORDED: 'Vấn đề quy trình nhập kho',
  OTHER: 'Bắt buộc ghi chú',
};

export const CreateStockTakeInput = z
  .object({
    warehouseId: z.string().uuid(),
    scope: z.enum(['FULL', 'PARTIAL']).default('FULL'),
    /** Nhóm hàng khi kiểm kê một phần — khớp `part.category` */
    scopeCategory: z.string().trim().min(1).max(100).optional(),
  })
  .refine((d) => d.scope !== 'PARTIAL' || d.scopeCategory !== undefined, {
    message: 'Kiểm kê một phần phải chọn nhóm hàng',
    path: ['scopeCategory'],
  });
export type CreateStockTakeInput = z.infer<typeof CreateStockTakeInput>;

/**
 * Nhập số đếm cho một mã hàng.
 *
 * Không nhận `variance` từ client: nó là cột SINH ở database. Cho client gửi
 * lên là cho phép khai một chênh lệch khác với số đã đếm.
 */
export const CountLineInput = z.object({
  partId: z.string().uuid(),
  countedQuantity: z.number().nonnegative(),
  reason: VarianceReason.optional(),
  note: z.string().trim().max(500).optional(),
});
export type CountLineInput = z.infer<typeof CountLineInput>;

export const ApproveStockTakeInput = z.object({
  note: z.string().trim().max(1000).optional(),
});
export type ApproveStockTakeInput = z.infer<typeof ApproveStockTakeInput>;

export const StockTakeLine = z.object({
  id: z.string().uuid(),
  partId: z.string().uuid(),
  sku: z.string(),
  partName: z.string(),
  /** Tồn sổ tại `snapshotAt` — snapshot, không đọc động */
  systemQuantity: z.number(),
  countedQuantity: z.number().nullable(),
  /** Xuất nhập phát sinh TỪ snapshot tới lúc đếm — để không thành chênh lệch giả */
  movementDelta: z.number(),
  variance: z.number(),
  /** `variance × giá vốn tại snapshot` */
  varianceValue: z.number().int(),
  reason: VarianceReason.nullable(),
  note: z.string().nullable(),
  /** Đang có bao nhiêu đơn vị bị GIỮ CHỖ — đếm thấp hơn số này thì không hạ được */
  reserved: z.number(),
});
export type StockTakeLine = z.infer<typeof StockTakeLine>;

export const StockTake = z.object({
  id: z.string().uuid(),
  code: z.string(),
  warehouseId: z.string().uuid(),
  warehouseName: z.string(),
  status: StockTakeStatus,
  scope: z.enum(['FULL', 'PARTIAL']),
  scopeCategory: z.string().nullable(),
  snapshotAt: z.string().nullable(),
  lines: z.array(StockTakeLine),
  /** Tổng GIÁ TRỊ TUYỆT ĐỐI của chênh lệch — thừa và thiếu KHÔNG bù nhau */
  totalVarianceValue: z.number().int(),
  /** Vượt `tenant.adjustment_threshold_amount` thì phải quản lý duyệt */
  needsManagerApproval: z.boolean(),
  approvalNote: z.string().nullable(),
  approvedAt: z.string().nullable(),
});
export type StockTake = z.infer<typeof StockTake>;

/**
 * Đơn đang giữ chỗ một mã hàng mà số đếm không đủ — BC-12 mục 4.
 *
 * 💡 Ràng buộc `available_non_negative` buộc nghiệp vụ phải rõ ràng: không thể
 * "làm cho xong" mà phải quyết định đơn nào của khách nào bị lùi. Danh sách này
 * là thứ người quản lý cần để quyết định điều đó.
 */
export const BlockingReservation = z.object({
  reservationId: z.string().uuid(),
  repairOrderId: z.string().uuid(),
  repairOrderCode: z.string(),
  plateNumber: z.string(),
  quantity: z.number(),
  promisedAt: z.string().nullable(),
});
export type BlockingReservation = z.infer<typeof BlockingReservation>;
