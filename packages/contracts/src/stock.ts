import { z } from 'zod';
import { moneyAmount } from './money.js';

/**
 * Loại chuyển động kho — khớp enum `movement_type` ở migration 0025.
 *
 * Dấu của `quantity` bị ràng buộc theo loại ngay ở database
 * (`sign_matches_type`): nhập dương, xuất âm, điều chỉnh tuỳ. Không có ràng
 * buộc đó thì một `RECEIPT` số lượng âm là đường rút hàng khỏi kho mà mọi báo
 * cáo đều đọc thành "nhập hàng".
 */
export const MovementType = z.enum([
  'RECEIPT',
  'ISSUE',
  'RETURN',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT',
]);
export type MovementType = z.infer<typeof MovementType>;

export const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  RECEIPT: 'Nhập kho',
  ISSUE: 'Xuất cho đơn',
  RETURN: 'Trả về kho',
  TRANSFER_IN: 'Chuyển đến',
  TRANSFER_OUT: 'Chuyển đi',
  ADJUSTMENT: 'Điều chỉnh',
};

/**
 * Số lượng hàng.
 *
 * 🔒 KHÔNG dùng `moneyAmount`: đây là số lượng, và số lượng CÓ phần thập phân
 * (4,8 lít dầu). INV-M-01 áp cho tiền, không áp cho lượng.
 *
 * Chặn 2 chữ số thập phân vì cột là `numeric(12,2)`. Không chặn ở đây thì
 * database lặng lẽ làm tròn 1,005 thành 1,01 và người nhập không hề biết —
 * cùng loại làm-tròn-thầm-lặng mà `calculateGross` phải xử lý ở phía tiền.
 */
export const quantityAmount = z
  .number()
  .positive('Số lượng phải lớn hơn 0')
  .max(999_999)
  .refine((n) => Number.isInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, {
    message: 'Số lượng chỉ nhận tối đa 2 chữ số thập phân',
  });

/**
 * Nhập kho.
 *
 * `unitCost` LÀ nhận từ client, khác hẳn giá bán ở báo giá. Lý do: giá vốn là
 * con số trên hoá đơn của nhà cung cấp — không có bảng nào trong hệ thống biết
 * nó, và nó đổi theo từng lô. Đây là dữ kiện được NHẬP, không phải được tra.
 *
 * Vì vậy nó bị chặn ở DB thay vì tin ứng dụng: `non_negative_cost` và
 * `cost_within_safe_range`.
 */
export const ReceiveStockInput = z.object({
  warehouseId: z.string().uuid(),
  partId: z.string().uuid(),
  quantity: quantityAmount,
  unitCost: moneyAmount,
  /** Số hoá đơn / phiếu giao của nhà cung cấp — để đối chiếu về sau */
  reference: z.string().trim().min(1).max(100).optional(),
  note: z.string().trim().max(500).optional(),
});
export type ReceiveStockInput = z.infer<typeof ReceiveStockInput>;

/**
 * Điều chỉnh tồn — dùng sau kiểm kê hoặc khi phát hiện ghi sai.
 *
 * 🔒 `delta` có dấu và KHÁC 0. Sửa sai bằng chứng từ đảo, không bằng cách sửa
 * dòng cũ (nguyên tắc 2 của CLAUDE.md, enforce bằng REVOKE UPDATE ở 0025).
 *
 * `reason` BẮT BUỘC, tối thiểu 5 ký tự — trùng với `adjustment_needs_reason` ở
 * DB. Điều chỉnh không lý do là điều chỉnh không giải thích được ở kỳ kiểm kê
 * sau, và đó chính là lúc người ta cần lời giải thích nhất.
 */
export const AdjustStockInput = z.object({
  warehouseId: z.string().uuid(),
  partId: z.string().uuid(),
  delta: z
    .number()
    .refine((n) => n !== 0, 'Điều chỉnh 0 không mang thông tin gì')
    .refine((n) => Math.abs(n) <= 999_999, 'Số lượng điều chỉnh quá lớn')
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, {
      message: 'Số lượng chỉ nhận tối đa 2 chữ số thập phân',
    }),
  reason: z.string().trim().min(5, 'Phải ghi lý do điều chỉnh').max(500),
});
export type AdjustStockInput = z.infer<typeof AdjustStockInput>;

export const Warehouse = z.object({
  id: z.string().uuid(),
  branchId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
});
export type Warehouse = z.infer<typeof Warehouse>;

export const StockBalance = z.object({
  warehouseId: z.string().uuid(),
  warehouseName: z.string(),
  partId: z.string().uuid(),
  sku: z.string(),
  partName: z.string(),
  unit: z.string(),
  onHand: z.number(),
  reserved: z.number(),
  /** Tồn khả dụng = onHand − reserved. Đây là con số người dùng cần, không phải onHand */
  available: z.number(),
  /** 🔒 Chỉ vai được xem giá vốn mới nhận được trường này (docs/02 mục 4) */
  avgCost: z.number().int().nullable(),
  minStockLevel: z.number(),
  /** Dưới mức tồn tối thiểu — để giao diện cảnh báo mà không tự tính lại */
  belowMinimum: z.boolean(),
});
export type StockBalance = z.infer<typeof StockBalance>;

export const StockMovement = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  partId: z.string().uuid(),
  sku: z.string(),
  partName: z.string(),
  type: MovementType,
  quantity: z.number(),
  unitCost: z.number().int().nullable(),
  refType: z.string().nullable(),
  refId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  createdByName: z.string(),
  createdAt: z.string(),
});
export type StockMovement = z.infer<typeof StockMovement>;
