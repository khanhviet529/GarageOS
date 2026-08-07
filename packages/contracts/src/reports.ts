import { z } from 'zod';

/**
 * Báo cáo — `docs/09-reports.md`.
 *
 * 🔒 Bốn nguyên tắc, và chúng để lại dấu ngay trong hình dạng của các kiểu ở
 * đây: mọi con số truy ngược được về chứng từ gốc, báo cáo chỉ đọc, mỗi báo cáo
 * nói rõ mốc thời gian, và những gì bị loại trừ phải NÓI RA — không loại trừ
 * lặng lẽ.
 */

export const ReportRange = z.object({
  /** Mốc đầu kỳ, ISO 8601. Thiếu thì mặc định 30 ngày gần nhất */
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
export type ReportRange = z.infer<typeof ReportRange>;

/**
 * R-F-02 — Lãi/lỗ theo đơn.
 *
 * 💡 `lai` là "tính đến thời điểm hiện tại", KHÔNG phải con số đóng băng: một
 * đơn có thể mất lãi nhiều tháng sau khi phát sinh bảo hành. Trường
 * `chiPhiBaoHanh` tồn tại chính vì điều đó.
 *
 * ⚠️ `doanhThuDuKien` lấy từ DÒNG BÁO GIÁ ĐÃ DUYỆT, không phải hoá đơn — Phase 3
 *    chưa làm. Tên trường nói ra điều đó để không ai đọc nhầm.
 */
export const ProfitPerOrder = z.object({
  repairOrderId: z.string().uuid(),
  code: z.string(),
  plateNumber: z.string(),
  powertrain: z.string(),
  status: z.string(),
  deliveredAt: z.string().nullable(),
  doanhThuDuKien: z.number().int(),
  giaVonPhuTung: z.number().int(),
  chiPhiCong: z.number().int(),
  chiPhiRework: z.number().int(),
  chiPhiBaoHanh: z.number().int(),
  /** `doanhThu − giaVon − cong − rework − baoHanh` */
  lai: z.number().int(),
  /** `lai / doanhThu`, null khi doanh thu bằng 0 (đơn bảo hành) */
  bienLoi: z.number().nullable(),
  laDonBaoHanh: z.boolean(),
});
export type ProfitPerOrder = z.infer<typeof ProfitPerOrder>;

export const ProfitReport = z.object({
  from: z.string(),
  to: z.string(),
  orders: z.array(ProfitPerOrder),
  tongDoanhThu: z.number().int(),
  tongChiPhi: z.number().int(),
  tongLai: z.number().int(),
  /** 🔒 Đã loại trừ những gì — nói ra, không loại trừ lặng lẽ */
  daLoaiTru: z.array(z.string()),
});
export type ProfitReport = z.infer<typeof ProfitReport>;

/**
 * R-O-01 — Thời gian chờ theo bộ phận.
 *
 * 💡 Báo cáo mà tài liệu gọi là "không phần mềm garage nào trên thị trường làm
 * tốt". Câu hỏi: xe nằm 3 ngày, bao nhiêu do thợ, bao nhiêu do chờ khách duyệt,
 * bao nhiêu do chờ phụ tùng?
 *
 * ⚠️ Trung vị và p90, KHÔNG trung bình — một xe bỏ quên kéo trung bình lên vô
 *    nghĩa. Vì vậy kiểu này không có trường `trungBinh`: không có chỗ để ai đó
 *    vô tình dùng nó.
 */
export const WaitTimeByStage = z.object({
  trangThai: z.string(),
  boPhan: z.string(),
  soLuot: z.number().int(),
  trungViGio: z.number(),
  p90Gio: z.number(),
  tongGio: z.number(),
});
export type WaitTimeByStage = z.infer<typeof WaitTimeByStage>;

export const WaitTimeReport = z.object({
  from: z.string(),
  to: z.string(),
  stages: z.array(WaitTimeByStage),
  daLoaiTru: z.array(z.string()),
});
export type WaitTimeReport = z.infer<typeof WaitTimeReport>;

/**
 * R-O-03 — Năng suất thợ.
 *
 * ⚠️ Ba chỉ số PHẢI xem cùng nhau: năng suất cao + rework cao = làm ẩu, không
 *    phải giỏi. Chúng nằm trong cùng một object, cố ý — tách thành hai endpoint
 *    là mở đường cho việc chỉ nhìn một nửa.
 *
 * `nangSuat` null nghĩa là CHƯA ĐỦ DỮ LIỆU (giờ thực tế dưới ba phút), không
 * phải bằng không — xem migration 0041.
 */
export const TechnicianProductivity = z.object({
  technicianId: z.string().uuid(),
  technicianName: z.string(),
  soViecXong: z.number().int(),
  gioDinhMuc: z.number().nullable(),
  gioThucTe: z.number().nullable(),
  nangSuat: z.number().nullable(),
  soLanQcTruot: z.number().int(),
  soViecLamLai: z.number().int(),
  tiLeRework: z.number().nullable(),
  chiPhiLamLai: z.number().int(),
});
export type TechnicianProductivity = z.infer<typeof TechnicianProductivity>;

/** R-S-01 / R-S-02 — tồn kho, cảnh báo và vòng quay */
export const StockReportLine = z.object({
  warehouseId: z.string().uuid(),
  warehouseName: z.string(),
  partId: z.string().uuid(),
  sku: z.string(),
  partName: z.string(),
  category: z.string().nullable(),
  onHand: z.number(),
  reserved: z.number(),
  available: z.number(),
  minStockLevel: z.number(),
  giaTriTon: z.number().int(),
  duoiMucToiThieu: z.boolean(),
  /** `giá vốn xuất 365 ngày / giá trị tồn`; null khi tồn bằng 0 */
  vongQuay: z.number().nullable(),
  /** `365 / vòng quay` — trên 365 ngày là VỐN CHẾT */
  soNgayTon: z.number().nullable(),
  laVonChet: z.boolean(),
});
export type StockReportLine = z.infer<typeof StockReportLine>;

/** R-S-03 — chênh lệch kiểm kê theo lý do */
export const VarianceByReason = z.object({
  reason: z.string(),
  soDong: z.number().int(),
  giaTriTuyetDoi: z.number().int(),
  giaTriRong: z.number().int(),
});
export type VarianceByReason = z.infer<typeof VarianceByReason>;

/**
 * R-O-02 — tỉ lệ đúng hẹn.
 *
 * 💡 Kèm SỐ LẦN DỜI HẸN, luôn. Tỉ lệ đúng hẹn 95% mà mỗi đơn dời hẹn ba lần thì
 * con số đó vô giá trị — và người đọc phải thấy cả hai cùng lúc.
 */
export const OnTimeReport = z.object({
  from: z.string(),
  to: z.string(),
  soDonBanGiao: z.number().int(),
  soDonDungHen: z.number().int(),
  tiLeDungHen: z.number().nullable(),
  tongSoLanDoiHen: z.number().int(),
  soDonCoDoiHen: z.number().int(),
  daLoaiTru: z.array(z.string()),
});
export type OnTimeReport = z.infer<typeof OnTimeReport>;
