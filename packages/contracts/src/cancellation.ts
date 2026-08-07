import { z } from 'zod';

/**
 * Huỷ đơn giữa chừng và quyết toán — BC-10.
 *
 * 🔒 Huỷ là QUYẾT TOÁN, không phải xoá. Câu hỏi duy nhất thật sự khó của cả
 * case: ai trả tiền cho phần đã làm?
 */

/**
 * Phụ tùng đã xuất ra khỏi kho rồi thì đi đâu — BC-10 mục 2.
 *
 * ⚠️ Không suy ra được từ dữ liệu. Hệ thống biết món hàng đã rời kho; nó không
 * biết món đó đang nằm trên bàn hay đã nằm trong xe. Chỉ THỢ mới trả lời được,
 * và đó là lý do bước này bắt buộc phải hỏi chứ không tự đoán.
 */
export const PartDisposition = z.enum([
  'RETURNED', // chưa lắp, trả về kho — không tính tiền
  'FITTED',   // đã lắp vào xe, không tháo ra được — tính đủ giá bán
  'DAMAGED',  // hỏng trong lúc tháo lắp — ai chịu tuỳ chính sách tenant
]);
export type PartDisposition = z.infer<typeof PartDisposition>;

export const PART_DISPOSITION_LABEL: Record<PartDisposition, string> = {
  RETURNED: 'Chưa lắp — trả về kho',
  FITTED: 'Đã lắp vào xe',
  DAMAGED: 'Hỏng khi tháo lắp',
};

/** Một phiếu xuất đang chờ thợ xác nhận đã lắp hay chưa */
export const CancelPreviewPart = z.object({
  movementId: z.string().uuid(),
  partId: z.string().uuid(),
  sku: z.string(),
  partName: z.string(),
  /** Số lượng đã xuất mà CHƯA trả về kho — phần còn phải quyết định */
  quantity: z.number(),
  quotationLineId: z.string().uuid().nullable(),
});

/**
 * Những gì sẽ bị đụng tới nếu huỷ ngay bây giờ.
 *
 * Màn huỷ đơn PHẢI hiện cái này trước khi hỏi "chắc chưa?". Câu hỏi "chắc
 * chưa?" trống rỗng không giúp ai quyết định gì.
 */
export const CancelPreview = z.object({
  repairOrderId: z.string().uuid(),
  status: z.string(),
  /** Đoạn giờ đang chạy — sẽ bị đóng tại thời điểm huỷ */
  openTimeLogCount: z.number().int(),
  /** Phân công chưa xong — sẽ chuyển CANCELLED, khoang và thợ được nhả */
  activeAssignmentCount: z.number().int(),
  /** Giữ chỗ đang treo — sẽ nhả, `reserved` giảm */
  activeReservationCount: z.number().int(),
  /** Phụ tùng đã xuất, cần thợ xác nhận đã lắp hay chưa */
  issuedParts: z.array(CancelPreviewPart),
  /** Còn huỷ được không — sau khi có hoá đơn thì không */
  cancellable: z.boolean(),
  lyDoKhongHuyDuoc: z.string().nullable(),
});
export type CancelPreview = z.infer<typeof CancelPreview>;

export const CancelOrderInput = z.object({
  /** 🔒 Khoá lạc quan — giống mọi thao tác đổi trạng thái khác */
  version: z.number().int().nonnegative(),
  reason: z.string().trim().min(3, 'Ghi rõ vì sao huỷ').max(500),
  /**
   * 🔒 Phân loại quyết định AI TRẢ TIỀN, không phải để cho đẹp báo cáo.
   * `GARAGE_UNABLE` = lỗi thuộc về garage = không thu công.
   */
  category: z.enum(['CUSTOMER_REQUEST', 'GARAGE_UNABLE', 'VEHICLE_ISSUE']),

  /**
   * Thợ xác nhận từng phiếu xuất. Thiếu phiếu nào thì phiếu đó coi như ĐÃ LẮP —
   * mặc định nghiêng về phía an toàn cho kho: không tự ý nhập hàng trở lại
   * bằng một dữ liệu không ai khai.
   */
  partDispositions: z
    .array(
      z.object({
        movementId: z.string().uuid(),
        disposition: PartDisposition,
        /** Trả về bao nhiêu — mặc định toàn bộ phần chưa trả */
        quantity: z.number().positive().optional(),
      }),
    )
    .default([]),

  /**
   * Tỉ lệ hoàn thành từng hạng mục, do thợ khai (0–100).
   *
   * Chỉ dùng khi chính sách tenant là `PERCENTAGE`. Với `ACTUAL_HOURS` thì giờ
   * công đã bấm là căn cứ, và nó không sửa được từ đây.
   */
  completions: z
    .array(
      z.object({
        quotationLineId: z.string().uuid(),
        completionPercent: z.number().int().min(0).max(100),
      }),
    )
    .default([]),
});
export type CancelOrderInput = z.infer<typeof CancelOrderInput>;

export const SettlementSource = z.enum([
  'DIAGNOSIS',
  'LABOR',
  'PART_FITTED',
  'PART_DAMAGED',
  'REFIT',
]);
export type SettlementSource = z.infer<typeof SettlementSource>;

export const SETTLEMENT_SOURCE_LABEL: Record<SettlementSource, string> = {
  DIAGNOSIS: 'Công chẩn đoán',
  LABOR: 'Công đã thực hiện',
  PART_FITTED: 'Phụ tùng đã lắp',
  PART_DAMAGED: 'Phụ tùng hỏng khi tháo lắp',
  REFIT: 'Công tháo/lắp lại',
};

export const SettlementLine = z.object({
  id: z.string().uuid(),
  seq: z.number().int(),
  nguon: SettlementSource,
  description: z.string(),
  completionPercent: z.number().int().nullable(),
  quantity: z.number(),
  unitPrice: z.number().int(),
  amount: z.number().int(),
});

export const SettlementStatus = z.enum(['DRAFT', 'CONFIRMED', 'DISPUTED', 'WAIVED']);
export type SettlementStatus = z.infer<typeof SettlementStatus>;

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  DRAFT: 'Chờ khách xác nhận',
  CONFIRMED: 'Khách đã xác nhận',
  DISPUTED: 'Khách không đồng ý',
  WAIVED: 'Đã miễn',
};

export const Settlement = z.object({
  id: z.string().uuid(),
  repairOrderId: z.string().uuid(),
  repairOrderCode: z.string(),
  status: SettlementStatus,
  /** Bản chụp chính sách lúc quyết toán — để giải thích được về sau */
  chinhSachCong: z.enum(['ACTUAL_HOURS', 'PERCENTAGE', 'NONE']),
  thuCongChanDoan: z.boolean(),
  lines: z.array(SettlementLine),
  /** Tổng = sum(lines.amount). Không lưu sẵn — xem lập luận ở migration 0034 */
  totalAmount: z.number().int(),
  disputeNote: z.string().nullable(),
  confirmedAt: z.string().nullable(),
});
export type Settlement = z.infer<typeof Settlement>;

export const DisputeSettlementInput = z.object({
  note: z.string().trim().min(5, 'Ghi nguyên văn điều khách không đồng ý').max(1000),
});
export type DisputeSettlementInput = z.infer<typeof DisputeSettlementInput>;

export const WaiveSettlementInput = z.object({
  note: z.string().trim().min(5, 'Ghi rõ vì sao miễn').max(1000),
});
export type WaiveSettlementInput = z.infer<typeof WaiveSettlementInput>;
